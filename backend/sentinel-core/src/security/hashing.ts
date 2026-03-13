/**
 * src/security/hashing.ts
 * ────────────────────────
 * All password and token hashing primitives.
 *
 * RULES:
 *  - No DB access
 *  - No network calls
 *  - No business logic
 *  - bcrypt ONLY for passwords (adaptive cost)
 *  - SHA-256 ONLY for opaque tokens (enrollment, refresh)
 *  - Algorithm upgrades happen here, nowhere else
 */
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { config } from '../config/index.js';

// ── Password hashing (bcrypt) ───────────────────────────────────────────────

/**
 * Hash a plaintext password using bcrypt.
 * Cost factor is read from validated config (default 12).
 */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, config.BCRYPT_SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 * Timing-safe via bcrypt's constant-time comparison.
 */
export async function comparePassword(
    password: string,
    hash: string,
): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

// ── Token hashing (SHA-256) ─────────────────────────────────────────────────

/**
 * Hash an opaque token (refresh token, enrollment token, API key) with SHA-256.
 * Only the hash is stored in the DB — the raw token is shown once and discarded.
 * SHA-256 is sufficient here because opaque tokens have high entropy by design.
 */
export function hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
}
