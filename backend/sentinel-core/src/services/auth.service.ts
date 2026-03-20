/**
 * auth.service.ts — Authentication data layer.
 * Crypto primitives are imported from the security layer.
 * This service does NOT import bcrypt or crypto directly.
 */
import { db } from '../lib/database.js';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { hashPassword, comparePassword, comparePasswordV2, hashToken } from '../security/index.js';

export class AuthService {
    static async hashPassword(password: string): Promise<string> {
        return hashPassword(password);
    }

    static async comparePassword(password: string, hash: string): Promise<boolean> {
        return comparePassword(password, hash);
    }

    static async comparePasswordV2(clientHash: string, hash: string): Promise<boolean> {
        return comparePasswordV2(clientHash, hash);
    }

    static async upgradeUserToE2EE(userId: string, newClientHash: string) {
        const newStoredHash = await hashPassword(newClientHash);
        await db.query(
            "UPDATE users SET password_hash = $1, password_version = 'v2', e2ee_enabled = true WHERE id = $2",
            [newStoredHash, userId]
        );
        logger.info({ userId }, 'User upgraded to E2EE authentication');
    }

    static async findUserByEmail(email: string) {
        const result = await db.query(
            'SELECT * FROM users WHERE email = $1 AND is_active = true',
            [email],
        );
        return result.rows[0] ?? null;
    }

    static async findUserById(id: string) {
        const result = await db.query(
            'SELECT * FROM users WHERE id = $1 AND is_active = true',
            [id],
        );
        return result.rows[0] ?? null;
    }

    static async storeRefreshToken(userId: string, rawToken: string, expiresAt: Date, familyId?: string) {
        const tokenHash = hashToken(rawToken);
        
        let newFamilyId = familyId;
        if (!newFamilyId) {
            // First time login generates a fresh session family
            const familyResult = await db.query('SELECT uuid_generate_v4() as id');
            newFamilyId = familyResult.rows[0].id;
        }

        await db.query(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, family_id) VALUES ($1, $2, $3, $4)',
            [userId, tokenHash, expiresAt, newFamilyId],
        );

        return newFamilyId;
    }

    static async verifyAndRotateRefreshToken(userId: string, oldRawToken: string) {
        const tokenHash = hashToken(oldRawToken);

        // Fetch without checking revocation first to determine if this is a stolen sequence
        const result = await db.query(
            `SELECT * FROM refresh_tokens
             WHERE user_id = $1
               AND token_hash = $2
               AND expires_at > NOW()`,
            [userId, tokenHash],
        );

        const tokenRecord = result.rows[0];
        if (!tokenRecord) {
            throw new Error('Invalid refresh token');
        }

        if (tokenRecord.is_revoked) {
            // 🚨 Replay Attack Detected: A consumed token is being presented again.
            // Revoke the entire family to terminate the hijacked session chain immediately.
            logger.warn({ userId, familyId: tokenRecord.family_id }, 'Possible Refresh Token Reuse Attack detected! Revoking token family.');
            await this.revokeTokenFamily(userId, tokenRecord.family_id);
            throw new Error('Invalid or reused refresh token');
        }

        // Token is valid and unrevoked. Mark it as consumed to prevent future use.
        await db.query(
            'UPDATE refresh_tokens SET is_revoked = true WHERE id = $1',
            [tokenRecord.id],
        );

        // Return the inherited family so the next token maintains the chain
        return tokenRecord.family_id;
    }

    static async revokeTokenFamily(userId: string, familyId: string) {
        await db.query(
            'UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1 AND family_id = $2',
            [userId, familyId],
        );
        
        // Let the security system know we forcibly decoupled a session
        logger.info({ userId, familyId }, 'Session token family revoked');
    }

    static async revokeAllTokens(userId: string) {
        await db.query(
            'UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1',
            [userId],
        );
    }

    static async handleFailedLogin(userId: string) {
        await db.query(
            `UPDATE users
             SET failed_login_attempts = failed_login_attempts + 1,
                 lockout_until = CASE
                     WHEN failed_login_attempts + 1 >= $2
                     THEN NOW() + INTERVAL '30 minutes'
                     ELSE lockout_until
                 END
             WHERE id = $1`,
            [userId, config.MAX_FAILED_ATTEMPTS],
        );
    }

    static async resetFailedLogin(userId: string) {
        await db.query(
            'UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE id = $1',
            [userId],
        );
    }
}
