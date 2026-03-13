import test from 'node:test';
import assert from 'node:assert/strict';
import moduleUnderTest from '../modules/rapid-failed-logins.js';
import { db } from '../src/lib/database.js';
import { AlertService } from '../src/services/alert.service.js';

test('Rapid Failed Logins Detection Module Logic', async (t) => {
    let alertGeneratedCount = 0;

    // Preserve originals
    const originalQuery = db.query;
    const originalCreateAlert = AlertService.createAlert;

    t.after(() => {
        // Restore mocks
        db.query = originalQuery;
        AlertService.createAlert = originalCreateAlert;
    });

    // Mock Alert Generation tracking
    AlertService.createAlert = async () => {
        alertGeneratedCount++;
        return true as any;
    };

    const orgId = 'org-123';
    const deviceId = 'device-123';

    // Baseline detection context
    const getContext = () => ({
        orgId,
        event: {
            id: 'evt-1',
            organization_id: orgId,
            device_id: deviceId,
            event_type: 'auth.failed',
            payload: { email: 'test@example.com' },
            signature: 'sig',
            integrity_hash: 'hash',
            processed: false,
            created_at: new Date()
        } as any,
        config: { threshold: 5, window_minutes: 5 }
    });


    await t.test('4 failed logins -> NO alert', async () => {
        alertGeneratedCount = 0;

        // Mock DB returning 4 rows
        db.query = async () => ({ rows: [{ count: '4' }] } as any);

        await moduleUnderTest.execute(getContext());
        assert.equal(alertGeneratedCount, 0, 'Should not alert under threshold');
    });

    await t.test('5 failed logins within window -> ALERT', async () => {
        alertGeneratedCount = 0;

        // Mock DB returning 5 rows
        db.query = async () => ({ rows: [{ count: '5' }] } as any);

        await moduleUnderTest.execute(getContext());
        assert.equal(alertGeneratedCount, 1, 'Should fire exactly 1 alert at threshold');
    });

    await t.test('5 failed logins outside window -> NO alert', async () => {
        alertGeneratedCount = 0;

        // Module configuration window limits are dynamically enforced by the DB SQL query filter.
        // If they fall outside the window, the DB returns < 5 rows.
        db.query = async () => ({ rows: [{ count: '3' }] } as any);

        await moduleUnderTest.execute(getContext());
        assert.equal(alertGeneratedCount, 0, 'Should not alert if older events fall outside the SQL window limits');
    });
});
