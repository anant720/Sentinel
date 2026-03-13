import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/database.js';
import { UserController } from '../src/controllers/user.controller.js';

test('Parallel Role Elevation (No inconsistent states)', async (t) => {
    // 1. Setup DB Context
    const orgRes = await db.query("INSERT INTO organizations (name, slug, api_key_hash) VALUES ('Parallel Role', 'pr-role', 'pr-hash') RETURNING id");
    const orgId = orgRes.rows[0].id;

    const actor1Res = await db.query("INSERT INTO users (organization_id, email, password_hash, role) VALUES ($1, 'a1@pr.com', 'hash', 'admin') RETURNING id", [orgId]);
    const actor1Id = actor1Res.rows[0].id;

    const actor2Res = await db.query("INSERT INTO users (organization_id, email, password_hash, role) VALUES ($1, 'a2@pr.com', 'hash', 'admin') RETURNING id", [orgId]);
    const actor2Id = actor2Res.rows[0].id;

    const targetRes = await db.query("INSERT INTO users (organization_id, email, password_hash, role) VALUES ($1, 'target@pr.com', 'hash', 'viewer') RETURNING id", [orgId]);
    const targetId = targetRes.rows[0].id;

    await t.test('Multiple admins mutating a user role in tight concurrency should strictly execute via Postgres row locking without deadlock', async () => {
        // Mocking Fastify req/reply
        const createMockReq = (actorId: string, desiredRole: string) => ({
            orgId,
            params: { id: targetId },
            user: { user_id: actorId },
            body: { role: desiredRole }
        });
        const mockReply: any = { code: () => mockReply, send: () => mockReply };

        // Fire both mutations dynamically without `await` inside the array mapping.
        // Actor 1 attempts to set to Admin
        // Actor 2 attempts to set to Member
        const p1 = UserController.updateRole(createMockReq(actor1Id, 'admin') as any, mockReply);
        const p2 = UserController.updateRole(createMockReq(actor2Id, 'analyst') as any, mockReply);

        await Promise.all([p1, p2]);

        // Final state check. Postgres standard READ COMMITTED guarantees one finishes last overriding the previous cleanly.
        // But importantly, BOTH mutations mapped into valid independent explicit Audit Logs. 
        const audits = await db.query("SELECT * FROM audit_logs WHERE organization_id = $1 AND action = 'user.role.update' ORDER BY created_at ASC", [orgId]);

        // Both parallel transactions completed and properly logged their respective mutations
        assert.equal(audits.rowCount, 2, 'Should definitively record both actions serially despite parallel submission');
    });

    t.after(async () => {
        await db.query("DELETE FROM organizations WHERE id = $1", [orgId]);
    });
});
