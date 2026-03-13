import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/database.js';
import { UserController } from '../src/controllers/user.controller.js';
import privilegeEscalationModule from '../modules/privilege-escalation.js';

test('Privilege Escalation Integration Flow', async (t) => {
    // 1. Setup Live Test Data in the DB to satisfy full FK constraints
    const orgRes = await db.query("INSERT INTO organizations (name, slug, api_key_hash) VALUES ('Escalation Test', 'esc-test', 'esc-hash') RETURNING id");
    const orgId = orgRes.rows[0].id;

    // Actor User (Admin)
    const actorRes = await db.query(
        "INSERT INTO users (organization_id, email, password_hash, role) VALUES ($1, 'admin@esc.com', 'hash', 'admin') RETURNING id",
        [orgId]
    );
    const actorId = actorRes.rows[0].id;

    // Target User (Viewer -> Admin)
    const targetRes = await db.query(
        "INSERT INTO users (organization_id, email, password_hash, role) VALUES ($1, 'viewer@esc.com', 'hash', 'viewer') RETURNING id",
        [orgId]
    );
    const targetId = targetRes.rows[0].id;

    await t.test('Elevating a user to Admin should write an Audit Log and emit a high-severity Alert', async () => {
        const mockRequest: any = {
            orgId,
            params: { id: targetId },
            user: { user_id: actorId },
            body: { role: 'admin' }
        };

        const mockReply: any = {
            code: (c: number) => mockReply,
            send: (b: any) => mockReply
        };

        // The controller inserts the event and pushes its ID to the BullMQ Redis queue.
        // Since Redis is running locally in docker, this succeeds safely without launching the full worker.

        await UserController.updateRole(mockRequest, mockReply);

        // Verify the Role mutated physically in DB
        const roleRes = await db.query("SELECT role FROM users WHERE id = $1", [targetId]);
        assert.equal(roleRes.rows[0].role, 'admin');

        // Verify the Audit Log
        const auditRes = await db.query("SELECT * FROM audit_logs WHERE organization_id = $1 AND action = 'user.role.update'", [orgId]);
        assert.equal(auditRes.rowCount, 1);
        assert.equal(auditRes.rows[0].metadata.newRole, 'admin');

        // Verify the simulated event emitted into the DB
        const eventRes = await db.query("SELECT * FROM events WHERE organization_id = $1 AND event_type = 'user_role_updated'", [orgId]);
        assert.equal(eventRes.rowCount, 1);
        const generatedEvent = eventRes.rows[0];

        // Execute Detection Module against the extracted event (Simulating the Worker Queue gracefully)
        await privilegeEscalationModule.execute({
            orgId,
            event: generatedEvent,
            config: {}
        });

        // Verify the Alert fired correctly
        const alertRes = await db.query("SELECT * FROM alerts WHERE organization_id = $1 AND type = 'privilege_escalation'", [orgId]);
        assert.equal(alertRes.rowCount, 1);
        assert.equal(alertRes.rows[0].severity, 'high');
    });

    // Cleanup
    t.after(async () => {
        await db.query("DELETE FROM organizations WHERE id = $1", [orgId]);
    });
});
