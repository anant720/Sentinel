import { FastifyRequest, FastifyReply } from 'fastify';
import { OrgService } from '../services/org.service.js';
import { AuditService } from '../services/audit.service.js';
import { JWTPayload } from '../middleware/auth.middleware.js';
import { z } from 'zod';

const createOrgSchema = z.object({
    name: z.string().min(3),
    slug: z.string().min(3).regex(/^[a-z0-9-]+$/),
});

const inviteSchema = z.object({
    email: z.string().email(),
    role: z.enum(['org_admin', 'security_analyst', 'viewer']),
    message: z.string().max(500).optional(),
});

const acceptInviteSchema = z.object({
    invite_token: z.string().min(1),
    full_name: z.string().min(2),
    password: z.string().min(8),
});

export class OrgController {
    static async create(request: FastifyRequest, reply: FastifyReply) {
        const validation = createOrgSchema.safeParse(request.body);
        if (!validation.success) {
            return reply.code(400).send({ error: 'Bad Request', details: validation.error.format() });
        }

        const { name, slug } = validation.data;
        const result = await OrgService.createOrganization(name, slug);

        const { user_id } = request.user as JWTPayload;

        // Automatically issue the Organization's first API Key natively upon creation
        const { ApiKeyService } = await import('../services/apikey.service.js');
        const tokenPair = await ApiKeyService.generateKey(result.organization.id, 1000);

        // Update the creating user to be the physical ORG_ADMIN of this tenant
        const { db } = await import('../db/client.js');
        await db.query(`UPDATE users SET organization_id = $1, role = $2 WHERE id = $3`,
            [result.organization.id, 'org_admin', user_id]
        );

        await AuditService.log({
            organization_id: result.organization.id,
            user_id,
            action: 'organization.create',
            resource_type: 'organization',
            resource_id: result.organization.id,
            ip_address: request.ip,
        });

        return reply.code(201).send({
            organization: result.organization,
            default_api_key: tokenPair.rawKey, // Returned exactly once
            message: 'Organization instantiated successfully. Store the default API key securely.'
        });
    }

    static async getById(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        // req.orgId is from JWT — service enforces orgId === id (users can only read their own org)
        const org = await OrgService.getOrganizationById(request.orgId, id);
        if (!org) {
            return reply.code(404).send({ error: 'Not Found', message: 'Organization not found' });
        }
        return org;
    }

    static async invite(request: FastifyRequest, reply: FastifyReply) {
        const validation = inviteSchema.safeParse(request.body);
        if (!validation.success) {
            request.log.warn({ errors: validation.error.format() }, 'Invitation validation failed');
            return reply.code(400).send({ error: 'Bad Request', details: validation.error.format() });
        }

        const { email, role, message } = validation.data;
        const orgId = request.orgId;
        const { user_id: actorId } = request.user as JWTPayload;

        const { db } = await import('../db/client.js');

        if (role === 'org_admin') {
            return reply.code(403).send({ error: 'Forbidden', message: 'Single Admin Policy: No additional administrators can be invited.' });
        }

        // Ensure user isn't already bound (only block if active)
        const existing = await db.query(`SELECT id FROM users WHERE email = $1 AND is_active = true`, [email]);
        if (existing.rows.length > 0) {
            request.log.warn({ email }, 'Invitation failed: Active user already exists');
            return reply.code(400).send({ error: 'Bad Request', message: 'User already exists and is active' });
        }

        // Generate 48-byte secure random token
        const { randomBytes, createHash } = await import('crypto');
        const rawToken = randomBytes(48).toString('base64url');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');

        // Expiry 1 hour
        const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000);

        // Invalidate any existing active invite for this email in this org
        await db.query(
            `UPDATE invite_tokens SET is_used = true WHERE email = $1 AND organization_id = $2 AND is_used = false`,
            [email, orgId]
        );

        // Fetch organization name for the email
        const orgRes = await db.query(`SELECT name FROM organizations WHERE id = $1`, [orgId]);
        const orgName = orgRes.rows[0]?.name || 'Your Organization';

        // Insert new hashed token
        await db.query(
            `INSERT INTO invite_tokens (organization_id, email, role, token_hash, expires_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [orgId, email, role, tokenHash, expiresAt]
        );
        
        // Log the invitation in the audit trail
        await AuditService.log({
            organization_id: orgId,
            user_id: actorId,
            action: 'user.invite',
            resource_type: 'user',
            resource_id: email, // Email as identifier for the invited user
            metadata: { role, message },
            ip_address: request.ip
        });

        // Send email via MailerService in background (avoids blocking the UI on SMTP latency)
        const { email: emailTo, role: inviteRole } = { email, role };
        import('../services/mailer.service.js').then(({ MailerService }) => {
            console.log(`[Mailer] Sending invite to ${emailTo} for org: ${orgName}, role: ${inviteRole}`);
            MailerService.sendInvite(emailTo, rawToken, orgName, inviteRole, message)
                .then(() => console.log(`[Mailer] ✅ Invite successfully sent to ${emailTo}`))
                .catch(err => console.error(`[Mailer] ❌ Failed to send invite to ${emailTo}:`, err?.message || err));
        }).catch(err => {
            console.error('[Mailer] ❌ Failed to import MailerService:', err?.message || err);
        });

        return reply.code(200).send({
            message: 'Invite generated successfully',
            token: rawToken
        });
    }

    static async acceptInvite(request: FastifyRequest, reply: FastifyReply) {
        const validation = acceptInviteSchema.safeParse(request.body);
        if (!validation.success) {
            return reply.code(400).send({ error: 'Bad Request', details: validation.error.format() });
        }

        const { invite_token, full_name, password } = validation.data;

        const { db, pool } = await import('../db/client.js');
        const { createHash } = await import('crypto');

        // Hash the incoming token
        const tokenHash = createHash('sha256').update(invite_token).digest('hex');

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Find matching token that is valid, unused, and unexpired
            const tokenRes = await client.query(
                `SELECT id, organization_id, email, role 
                 FROM invite_tokens 
                 WHERE token_hash = $1 
                   AND is_used = false 
                   AND expires_at > NOW() 
                 FOR UPDATE`,
                [tokenHash]
            );

            if (tokenRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid, expired, or already used invite token' });
            }

            const tokenRecord = tokenRes.rows[0];

            // Cryptographically hash the password
            const { AuthService } = await import('../services/auth.service.js');
            const passwordHash = await AuthService.hashPassword(password);

            // Upsert the user: insert if new, update/reactivate if exists
            const result = await client.query(
                `INSERT INTO users (organization_id, email, password_hash, full_name, role, is_active)
                 VALUES ($1, $2, $3, $4, $5, true)
                 ON CONFLICT (email) DO UPDATE SET
                    organization_id = EXCLUDED.organization_id,
                    password_hash = EXCLUDED.password_hash,
                    full_name = EXCLUDED.full_name,
                    role = EXCLUDED.role,
                    is_active = true,
                    updated_at = NOW()
                 RETURNING id, email, role, organization_id`,
                [tokenRecord.organization_id, tokenRecord.email, passwordHash, full_name, tokenRecord.role]
            );

            // Mark token as used
            await client.query(
                `UPDATE invite_tokens SET is_used = true WHERE id = $1`,
                [tokenRecord.id]
            );

            await client.query('COMMIT');

            // Generate JWT for immediate login
            const user = result.rows[0];
            const { generateSecureToken, TOKEN_EXPIRY } = await import('../security/index.js');
            const { config } = await import('../config/index.js');

            const payload = {
                user_id: user.id,
                organization_id: user.organization_id,
                role: user.role,
            };

            const accessToken = await reply.jwtSign(payload, {
                header: { kid: config.JWT_ACTIVE_KID, alg: 'HS256' },
                key: config.JWT_SECRETS_MAP[config.JWT_ACTIVE_KID]!
            });

            const refreshToken = generateSecureToken(40);
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + TOKEN_EXPIRY.REFRESH_DAYS);

            await AuthService.storeRefreshToken(user.id, refreshToken, expiresAt);

            // Set refresh token in cookie
            reply.setCookie('refreshToken', refreshToken, {
                path: '/auth/refresh',
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                expires: expiresAt,
            });

            return reply.code(201).send({
                message: 'User created and bound to Org successfully',
                user,
                access_token: accessToken
            });
        } catch (err) {
            await client.query('ROLLBACK');
            request.log.warn({ err }, 'Failed to accept invite token');
            // If duplicate user is created, catch unique constraint violation
            if ((err as any).code === '23505') {
                return reply.code(400).send({ error: 'Bad Request', message: 'User already exists' });
            }
            return reply.code(500).send({ error: 'Internal Server Error', message: 'Failed to accept invite' });
        } finally {
            client.release();
        }
    }

    static async deleteInvitation(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        const { user_id } = request.user as JWTPayload;

        const { db } = await import('../db/client.js');
        
        const result = await db.query(
            `UPDATE invite_tokens SET is_used = true WHERE id = $1 AND organization_id = $2 AND is_used = false RETURNING email`,
            [id, request.orgId]
        );

        if (result.rows.length === 0) {
            return reply.code(404).send({ error: 'Not Found', message: 'Invitation not found or already used' });
        }

        await AuditService.log({
            organization_id: request.orgId,
            user_id,
            action: 'invitation.revoke',
            resource_type: 'invitation',
            resource_id: id,
            metadata: { email: result.rows[0].email }
        });

        return { message: 'Invitation revoked successfully' };
    }

    static async deleteOrganization(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        const { user_id } = request.user as JWTPayload;
        const orgId = request.orgId;

        // Prevent cross-tenant deletion
        if (id !== orgId) {
            return reply.code(403).send({ error: 'Forbidden', message: 'You can only delete your own organization' });
        }

        const schema = z.object({
            password: z.string().min(1),
            orgName: z.string().min(1)
        });

        const validation = schema.safeParse(request.body);
        if (!validation.success) {
            return reply.code(400).send({ error: 'Bad Request', details: validation.error.format() });
        }

        const { password, orgName } = validation.data;
        const { db } = await import('../db/client.js');

        // Verify organization name exactly matches
        const orgRes = await db.query('SELECT name FROM organizations WHERE id = $1', [orgId]);
        if (orgRes.rows.length === 0) {
            return reply.code(404).send({ error: 'Not Found', message: 'Organization not found' });
        }
        if (orgRes.rows[0].name !== orgName) {
            return reply.code(400).send({ error: 'Bad Request', message: 'Organization name does not match' });
        }

        // Verify user password
        const userRes = await db.query('SELECT password_hash FROM users WHERE id = $1', [user_id]);
        if (userRes.rows.length === 0) {
            return reply.code(401).send({ error: 'Unauthorized', message: 'User not found' });
        }
        
        const { AuthService } = await import('../services/auth.service.js');
        const isValid = await AuthService.comparePassword(password, userRes.rows[0].password_hash);
        if (!isValid) {
            return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid admin password' });
        }

        // Delete the organization.
        // NOTE: "ON DELETE CASCADE" in the schema handles users, events, devices, api_keys, and alerts recursively.
        // Audit logs are preserved via "ON DELETE SET NULL"
        await db.query('DELETE FROM organizations WHERE id = $1', [orgId]);

        // We clear the cookies so the deleted org_admin is forced out
        reply.clearCookie('refreshToken', { path: '/auth/refresh' });

        return reply.code(200).send({ message: 'Organization and all associated data have been permanently deleted.' });
    }
}
