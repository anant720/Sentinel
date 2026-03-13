/**
 * src/security/jwt.ts
 * ────────────────────
 * JWT payload type + @fastify/jwt registration config.
 *
 * RULES:
 *  - No business logic
 *  - No DB access
 *  - All secrets from validated config only
 *  - Signing & verification are done by @fastify/jwt decorations
 *    (reply.jwtSign / request.jwtVerify) — those cannot be decoupled
 *    from the Fastify lifecycle without re-implementing the plugin.
 *    This module owns the SHAPE and CONFIG of every token.
 */
import { config } from '../config/index.js';
import { Role, isValidRole } from '../rbac/index.js';

// ── Token payload contract ──────────────────────────────────────────────────

export interface AccessTokenPayload {
    user_id: string;
    organization_id: string;
    role: Role;  // Typed as the Role enum — not a raw string
}

// ── @fastify/jwt plugin configuration ──────────────────────────────────────

/**
 * Returns the options object used when registering @fastify/jwt.
 * Single point of configuration for all token parameters.
 */
export function getJwtConfig(): any {
    return {
        secret: (request: any, parsedPayload: any, cb: (err: Error | null, secret?: string) => void) => {
            try {
                // @fastify/jwt calls this callback for BOTH signing and verification.
                // During signing (reply.jwtSign), parsedPayload is the outgoing payload object.
                // During verification (request.jwtVerify), parsedPayload is null and we must read
                // the kid from the incoming token's header to select the correct secret.

                const authHeader = request.headers?.authorization;
                const isVerifying = !parsedPayload && !!authHeader;

                if (isVerifying) {
                    // Verification path: decode kid from incoming token header
                    const tokenStr = authHeader.replace(/^Bearer\s+/i, '');
                    const decoded: any = request.server.jwt.decode(tokenStr, { complete: true });
                    const kid = decoded?.header?.kid || 'default';
                    const secret = config.JWT_SECRETS_MAP[kid];
                    if (!secret) return cb(new Error(`Invalid key ID (kid): ${kid}`));
                    return cb(null, secret);
                }

                // Signing path: always use the currently active key
                const activeSecret = config.JWT_SECRETS_MAP[config.JWT_ACTIVE_KID];
                if (!activeSecret) return cb(new Error('No active JWT signing key configured'));
                return cb(null, activeSecret);
            } catch (err: any) {
                return cb(err);
            }
        },
        cookie: {
            cookieName: 'refreshToken',
            signed: false,
        },
        sign: {
            expiresIn: config.JWT_EXPIRES_IN,
        },
    };
}


/**
 * Validates that a decoded token object matches the AccessTokenPayload shape.
 * Throws on malformed payloads before they reach controllers.
 */
export function validateTokenPayload(payload: unknown): AccessTokenPayload {
    const p = payload as Record<string, unknown>;

    if (
        typeof p?.user_id !== 'string' ||
        typeof p?.organization_id !== 'string' ||
        !isValidRole(p?.role)  // Rejects unknown roles at the JWT boundary
    ) {
        throw new Error('Malformed JWT payload: missing or invalid claims');
    }

    return {
        user_id: p.user_id,
        organization_id: p.organization_id,
        role: p.role as Role,
    };
}

/** Expiry constants — single place to modify token lifetimes. */
export const TOKEN_EXPIRY = {
    ACCESS: config.JWT_EXPIRES_IN,
    REFRESH_DAYS: 7,
} as const;
