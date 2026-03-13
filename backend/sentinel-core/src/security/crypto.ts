/**
 * src/security/crypto.ts
 * ───────────────────────
 * Low-level cryptographic utilities.
 *
 * RULES:
 *  - No DB access
 *  - No network calls
 *  - No business logic
 *  - This is the ONLY place in the project that imports node:crypto
 *    (excluding hashing.ts which imports createHash)
 *  - Device signature verification lives here exclusively
 */
import { randomBytes, randomUUID, createVerify, createHash, createHmac } from 'crypto';

// ── Random token generation ─────────────────────────────────────────────────

/**
 * Generate a cryptographically random hex token.
 * Default 32 bytes = 64 hex chars (256 bits of entropy).
 */
export function generateSecureToken(byteLength = 32): string {
    return randomBytes(byteLength).toString('hex');
}

/**
 * Generate a UUID v4 for request correlation or IDs.
 */
export function generateRequestId(): string {
    return randomUUID();
}

// ── Integrity hashing ───────────────────────────────────────────────────────

/**
 * Compute a SHA-256 integrity hash for an event payload string.
 * Used to detect tampering after ingestion.
 */
export function computeIntegrityHash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
}

// ── Device signature verification (RSA-SHA256) ──────────────────────────────

/**
 * Verify a device's RSA-SHA256 event signature using the device's stored public key.
 * Returns false on any failure (invalid signature, malformed key, algorithm mismatch).
 *
 * The device signs JSON.stringify(payload) with its private key.
 * The platform verifies with the public key registered during device enrollment.
 */
export function verifyEventSignature(
    payloadStr: string,
    signature: string,
    publicKey: string,
): boolean {
    try {
        const verifier = createVerify('SHA256');
        verifier.update(payloadStr);
        verifier.end();
        return verifier.verify(publicKey, signature, 'hex');
    } catch {
        return false;
    }
}

// ── HMAC (for future use / webhook validation) ──────────────────────────────

/**
 * Compute an HMAC-SHA256 over data using a symmetric key.
 * Suitable for: webhook signatures, internal service-to-service auth.
 */
export function computeHmac(data: string, key: string): string {
    return createHmac('sha256', key).update(data).digest('hex');
}

/**
 * Constant-time HMAC verification.
 * Returns true only if the provided signature matches the computed HMAC.
 */
export function verifyHmacSignature(data: string, signature: string, key: string): boolean {
    const expected = computeHmac(data, key);
    // Constant-time comparison via re-hashing both sides with a random key
    const keyBytes = randomBytes(32);
    const a = createHmac('sha256', keyBytes).update(expected).digest();
    const b = createHmac('sha256', keyBytes).update(signature).digest();
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
    return diff === 0;
}
