/**
 * auth.controller.ts — Authentication request handlers.
 * No crypto imports. Token generation delegates to the security layer.
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../lib/logger.js';
import { AuthService } from '../services/auth.service.js';
import { AuditService } from '../services/audit.service.js';
import { EventService } from '../services/event.service.js';
import { MetricsService } from '../services/metrics.service.js';
import { JWTPayload } from '../middleware/auth.middleware.js';
import { generateSecureToken, TOKEN_EXPIRY, AccessTokenPayload } from '../security/index.js';
import { config } from '../config/index.js';
import { z } from 'zod';

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    is_client_hashed: z.boolean().optional().default(false),
});

const refreshSchema = z.object({
    user_id: z.string().uuid(),
});

export class AuthController {
    static async login(request: FastifyRequest, reply: FastifyReply) {
        const validation = loginSchema.safeParse(request.body);
        if (!validation.success) {
            return reply.code(400).send({ error: 'Bad Request', details: validation.error.format() });
        }

        const { email, password } = validation.data;
        const user = await AuthService.findUserByEmail(email);

        if (!user) {
            await EventService.publish({
                organization_id: '00000000-0000-0000-0000-000000000000', // Orphaned login attempt (Null UUID)
                event_type: 'login_failed',
                payload: { email },
            });
            MetricsService.loginFailuresTotal.labels('user_not_found').inc();
            return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid credentials' });
        }

        if (user.lockout_until && new Date(user.lockout_until) > new Date()) {
            return reply.code(403).send({ error: 'Forbidden', message: 'Account locked. Try again later.' });
        }

        let isMatch = false;
        if (user.password_version === 'v2') {
            isMatch = await AuthService.comparePasswordV2(password, user.password_hash);
        } else {
            isMatch = await AuthService.comparePassword(password, user.password_hash);
        }

        if (!isMatch) {
            await AuthService.handleFailedLogin(user.id);
            await EventService.publish({
                organization_id: user.organization_id,
                event_type: 'login_failed',
                payload: { email, user_id: user.id },
            });
            try {
                const { db } = await import('../lib/database.js');
                const { GeoIPService } = await import('../services/geoip.service.js');
                
                const clientIp = request.ip || '';
                const geoLookup = await GeoIPService.lookup(clientIp);
                const geo = {
                    country: (request.headers['cf-ipcountry'] as string) || (request.headers['x-vercel-ip-country'] as string) || geoLookup?.country || null,
                    countryCode: (request.headers['cf-ipcountry'] as string) || (request.headers['x-vercel-ip-country'] as string) || geoLookup?.countryCode || null,
                    city: (request.headers['x-vercel-ip-city'] as string) || geoLookup?.city || null,
                    lat: geoLookup?.lat || null,
                    lon: geoLookup?.lon || null,
                    isp: geoLookup?.isp || null,
                    address: null // Front-end logins don't send GPS currently
                };

                const failPayload = JSON.stringify({
                    email,
                    user_id: user.id,
                    ip_address: clientIp,
                    user_agent: request.headers['user-agent'] ?? null,
                    risk_score: 35,
                });

                await db.query(
                    `INSERT INTO events (
                        organization_id, event_type, payload, signature, integrity_hash, processed,
                        ip_address, geo_country, geo_country_code, geo_city, geo_lat, geo_lon, geo_isp, geo_address
                     ) VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8, $9, $10, $11, $12, $13)`,
                    [
                        user.organization_id, 'login_failure', failPayload, 'auth-controller', 'auth-controller',
                        clientIp, geo.country, geo.countryCode, geo.city, geo.lat, geo.lon, geo.isp, geo.address
                    ]
                );
                if ((global as any).broadcastSecurityEvent) {
                    (global as any).broadcastSecurityEvent({
                        id: `fail-${user.id}-${Date.now()}`,
                        type: 'login_failure',
                        timestamp: Date.now(),
                        severity: 'medium',
                        payload: { 
                            email, 
                            ip_address: clientIp,
                            location: { city: geo.city, country: geo.country }
                        },
                    });
                }
            } catch { /* non-blocking */ }
            MetricsService.loginFailuresTotal.labels('invalid_password').inc();
            return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid credentials' });
        }

        await AuthService.resetFailedLogin(user.id);

        const payload: AccessTokenPayload = {
            user_id: user.id,
            organization_id: user.organization_id,
            role: user.role,
            jti: generateSecureToken(32), // Added unique JTI for revocation
        };
        const accessToken = await reply.jwtSign(payload, {
            header: { kid: config.JWT_ACTIVE_KID, alg: 'HS256' },
            key: config.JWT_SECRETS_MAP[config.JWT_ACTIVE_KID]!
        });

        // Refresh token: generate via security layer, store hash only
        const refreshToken = generateSecureToken(40);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + TOKEN_EXPIRY.REFRESH_DAYS);

        await AuthService.storeRefreshToken(user.id, refreshToken, expiresAt);

        reply.setCookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            expires: expiresAt,
        });

        await AuditService.log({
            organization_id: user.organization_id,
            user_id: user.id,
            action: 'auth.login',
            resource_type: 'user',
            resource_id: user.id,
            ip_address: request.ip,
        });

        // Record login success in events for org-wide admin visibility
        try {
            const { db } = await import('../lib/database.js');
            const { GeoIPService } = await import('../services/geoip.service.js');
                
            const clientIp = request.ip || '';
            const geoLookup = await GeoIPService.lookup(clientIp);
            const geo = {
                country: (request.headers['cf-ipcountry'] as string) || (request.headers['x-vercel-ip-country'] as string) || geoLookup?.country || null,
                countryCode: (request.headers['cf-ipcountry'] as string) || (request.headers['x-vercel-ip-country'] as string) || geoLookup?.countryCode || null,
                city: (request.headers['x-vercel-ip-city'] as string) || geoLookup?.city || null,
                lat: geoLookup?.lat || null,
                lon: geoLookup?.lon || null,
                isp: geoLookup?.isp || null,
                address: null // Front-end logins don't send GPS currently
            };

            const successPayload = JSON.stringify({
                email: user.email,
                user_id: user.id,
                role: user.role,
                ip_address: clientIp,
                user_agent: request.headers['user-agent'] ?? null,
                risk_score: 0,
            });

            await db.query(
                `INSERT INTO events (
                    organization_id, event_type, payload, signature, integrity_hash, processed,
                    ip_address, geo_country, geo_country_code, geo_city, geo_lat, geo_lon, geo_isp, geo_address
                 ) VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8, $9, $10, $11, $12, $13)`,
                [
                    user.organization_id, 'login_success', successPayload, 'auth-controller', 'auth-controller',
                    clientIp, geo.country, geo.countryCode, geo.city, geo.lat, geo.lon, geo.isp, geo.address
                ]
            );
            // Broadcast to WebSocket org channel
            if ((global as any).broadcastSecurityEvent) {
                (global as any).broadcastSecurityEvent({
                    id: `${user.id}-${Date.now()}`,
                    type: 'login_attempt',
                    timestamp: Date.now(),
                    severity: 'low',
                    payload: { 
                        email: user.email, 
                        ip_address: clientIp, 
                        role: user.role,
                        location: { city: geo.city, country: geo.country }
                    },
                });
            }
        } catch (err: any) { 
            console.error('Login Event Insert Failed:', err);
        }

        return { 
            accessToken, 
            e2ee: {
                enabled: !!user.e2ee_enabled,
                version: user.password_version
            }
        };
    }

    static async upgradeToE2EE(request: FastifyRequest, reply: FastifyReply) {
        const { user_id } = request.user as JWTPayload;
        const body = request.body as { client_hash: string };
        
        if (!body.client_hash) {
            return reply.code(400).send({ error: 'Bad Request', message: 'client_hash is required' });
        }

        await AuthService.upgradeUserToE2EE(user_id, body.client_hash);
        return { message: 'Security upgraded to E2EE' };
    }

    static async refresh(request: FastifyRequest, reply: FastifyReply) {
        const oldRefreshToken = request.cookies.refreshToken;
        if (!oldRefreshToken) {
            return reply.code(401).send({ error: 'Unauthorized', message: 'Refresh token missing' });
        }

        const validation = refreshSchema.safeParse(request.body);
        if (!validation.success) {
            return reply.code(400).send({ error: 'Bad Request', message: 'user_id is required' });
        }

        const { user_id } = validation.data;

        let familyId: string;
        try {
            familyId = await AuthService.verifyAndRotateRefreshToken(user_id, oldRefreshToken) as string;
        } catch {
            reply.clearCookie('refreshToken');
            return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or reused refresh token' });
        }

        const user = await AuthService.findUserById(user_id);
        if (!user) {
            return reply.code(401).send({ error: 'Unauthorized', message: 'User not found' });
        }

        const newPayload: AccessTokenPayload = {
            user_id: user.id,
            organization_id: user.organization_id,
            role: user.role,
            jti: generateSecureToken(32), // Added unique JTI for rotated token
        };
        const newAccessToken = await reply.jwtSign(newPayload, {
            header: { kid: config.JWT_ACTIVE_KID, alg: 'HS256' },
            key: config.JWT_SECRETS_MAP[config.JWT_ACTIVE_KID]!
        });

        // New refresh token via security layer
        const newRefreshToken = generateSecureToken(40);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + TOKEN_EXPIRY.REFRESH_DAYS);

        await AuthService.storeRefreshToken(user.id, newRefreshToken, expiresAt, familyId);

        reply.setCookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            expires: expiresAt,
        });

        return { accessToken: newAccessToken };
    }

    static async logout(request: FastifyRequest, reply: FastifyReply) {
        const { user_id, jti, exp } = request.user as JWTPayload & { exp: number };
        const orgId = request.orgId;

        // Blacklist the JTI in Redis until it naturally expires
        if (jti && exp) {
            const { redisClient, isRedisHealthy } = await import('../lib/redis.js');
            if (isRedisHealthy) {
                const now = Math.floor(Date.now() / 1000);
                const ttl = exp - now;
                if (ttl > 0) {
                    await redisClient.set(`revoked:${jti}`, 'true', 'EX', ttl);
                    logger.debug({ jti, ttl }, 'Access token blacklisted in Redis');
                }
            } else {
                logger.warn({ user_id, jti }, 'Redis unavailable during logout -> token revocation skipped');
            }
        }

        await AuthService.revokeAllTokens(user_id);
        reply.clearCookie('refreshToken');

        await AuditService.log({
            organization_id: orgId,
            user_id,
            action: 'auth.logout',
            resource_type: 'user',
            resource_id: user_id,
            ip_address: request.ip,
        });

        return { message: 'Logged out successfully' };
    }
}
