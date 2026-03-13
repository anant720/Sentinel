import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

// The canonical logic used identically across Detection Modules for Bucket Fingerprinting
function generateModuleFingerprint(orgId: string, ruleType: string, deviceId: string, timestamp: number, windowMs: number): string {
    const bucket = Math.floor(timestamp / windowMs);
    return crypto.createHash('sha256')
        .update(`${orgId}:${ruleType}:${deviceId}:${bucket}`)
        .digest('hex');
}

test('Detection Module Fingerprint Determinism constraints', async (t) => {
    const orgAlpha = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const orgBeta = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22';
    const device = 'device_001';

    // 5 Minute Window
    const windowMs = 5 * 60 * 1000;

    // Absolute point in time cleanly divisible by 300,000 (Bucket 5666667)
    const t0 = 1700000100000;

    // 4 minutes later (Same 5-min bucket)
    const t1_within_bucket = t0 + (4 * 60 * 1000);

    // 6 minutes later (Different 5-min bucket)
    const t2_outside_bucket = t0 + (6 * 60 * 1000);

    await t.test('Identical inputs within the exact same chronological bucket yield identical fingerprints', () => {
        const fp0 = generateModuleFingerprint(orgAlpha, 'brute_force', device, t0, windowMs);
        const fp1 = generateModuleFingerprint(orgAlpha, 'brute_force', device, t1_within_bucket, windowMs);

        // Assert they collide precisely into the database constraint
        assert.equal(fp0, fp1);
    });

    await t.test('Mutating the Organization Context explicitly shatters the collision', () => {
        const fp0 = generateModuleFingerprint(orgAlpha, 'brute_force', device, t0, windowMs);
        const fp2 = generateModuleFingerprint(orgBeta, 'brute_force', device, t0, windowMs); // Beta

        assert.notEqual(fp0, fp2);
    });

    await t.test('Advancing time linearly past the rolling `windowMs` generates a fresh bucket fingerprint', () => {
        const fp0 = generateModuleFingerprint(orgAlpha, 'brute_force', device, t0, windowMs);
        const fp3 = generateModuleFingerprint(orgAlpha, 'brute_force', device, t2_outside_bucket, windowMs);

        assert.notEqual(fp0, fp3);
    });

    await t.test('Mutating the Detection Rule securely isolates the signature state', () => {
        const fp0 = generateModuleFingerprint(orgAlpha, 'brute_force', device, t0, windowMs);
        const fp4 = generateModuleFingerprint(orgAlpha, 'impossible_travel', device, t0, windowMs); // Rule mutation

        assert.notEqual(fp0, fp4);
    });
});
