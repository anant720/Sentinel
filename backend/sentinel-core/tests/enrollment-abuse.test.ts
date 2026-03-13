import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/database.js';
import { DeviceService } from '../src/services/device.service.js';
import enrollmentAbuseModule from '../modules/enrollment-abuse.js';

test('Device Enrollment Harvesting / Replay Attack Integration', async (t) => {
    // 1. Setup Live Context
    const orgRes = await db.query("INSERT INTO organizations (name, slug, api_key_hash) VALUES ('Enrollment Test', 'enr-test', 'enr-hash') RETURNING id");
    const orgId = orgRes.rows[0].id;

    // We need an admin user to generate a token
    const adminRes = await db.query(
        "INSERT INTO users (organization_id, email, password_hash, role) VALUES ($1, 'admin@enr.com', 'hash', 'admin') RETURNING id",
        [orgId]
    );
    const adminId = adminRes.rows[0].id;

    await t.test('Attempting to register a device with an ALREADY CONSUMED token triggers the Abuse Detection pipeline', async () => {

        try {
            // Generate a valid token natively
            const plainToken = await DeviceService.createEnrollmentToken(orgId, adminId, 24); // 24 hours

            // Sabotage the token in the DB to simulate it was already consumed by a legitimate device earlier
            await db.query("UPDATE enrollment_tokens SET is_used = true WHERE organization_id = $1", [orgId]);

            // Attempt rogue registration
            try {
                await DeviceService.registerDevice(orgId, plainToken, 'Hacker VM', 'kali-linux', 'rogue-pubkey');
                assert.fail('Should have aggressively thrown an Error interrupting the enrollment lifecycle');
            } catch (err: any) {
                assert.equal(err.message, 'Enrollment token is already_used. Security alert generated.');
            }

            // Verify the Security Telemetry Event was autonomously emitted natively by the service
            const eventRes = await db.query("SELECT * FROM events WHERE organization_id = $1 AND event_type = 'enrollment_token_abuse'", [orgId]);
            assert.equal(eventRes.rowCount, 1, 'Event emission failed: No telemetry was written tracking the abuse');

            const event = eventRes.rows[0];
            assert.equal(event.payload.failed_enrollment_reason, 'already_used');
            assert.equal(event.payload.attempted_device_name, 'Hacker VM');

            // Pass it directly into the Detection Matrix
            await enrollmentAbuseModule.execute({
                orgId,
                event: event,
                config: {}
            });

            // Verify Alert persistence
            const alertRes = await db.query("SELECT * FROM alerts WHERE organization_id = $1 AND type = 'enrollment_token_abuse'", [orgId]);
            assert.equal(alertRes.rowCount, 1, 'Alert Service failed to enforce persistence of the Medium Severity Token Abuse');
            assert.equal(alertRes.rows[0].severity, 'medium');

        } catch (e: any) {
            assert.fail(e);
        }
    });

    t.after(async () => {
        await db.query("DELETE FROM organizations WHERE id = $1", [orgId]);
    });
});
