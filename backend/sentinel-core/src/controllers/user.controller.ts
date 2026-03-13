import { FastifyRequest, FastifyReply } from 'fastify';
import { JWTPayload } from '../middleware/auth.middleware.js';
import { AuditService } from '../services/audit.service.js';
import { db } from '../lib/database.js';
import { isValidRole } from '../rbac/index.js';
import { enqueueEvent } from '../queues/event.queue.js';
import { computeIntegrityHash } from '../security/index.js';
import { z } from 'zod';

const updateRoleSchema = z.object({
    role: z.string()
});

export class UserController {
    static async getMe(request: FastifyRequest, reply: FastifyReply) {
        const { user_id } = request.user as JWTPayload;

        const result = await db.query(
            `SELECT u.id, u.email, u.full_name, u.role, u.organization_id, o.name as org_name, o.slug as org_slug
             FROM users u
             JOIN organizations o ON u.organization_id = o.id
             WHERE u.id = $1`,
            [user_id]
        );

        if (result.rows.length === 0) {
            return reply.code(404).send({ error: 'Not Found', message: 'User profile not found' });
        }

        const user = result.rows[0];
        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.full_name,
                role: user.role,
                organization_id: user.organization_id,
                organization: {
                    name: user.org_name,
                    slug: user.org_slug
                }
            }
        };
    }

    static async updateRole(request: FastifyRequest, reply: FastifyReply) {
        const { id: targetUserId } = request.params as { id: string };
        const { user_id: actorId } = request.user as JWTPayload;

        const validation = updateRoleSchema.safeParse(request.body);
        if (!validation.success) {
            return reply.code(400).send({ error: 'Bad Request', details: validation.error.format() });
        }

        const newRole = validation.data.role;
        // Verify RBAC enum structurally
        if (!isValidRole(newRole as any)) {
            return reply.code(400).send({ error: 'Bad Request', message: `Invalid role enum: ${newRole}` });
        }

        // 1. Fetch current role and ensure target maps directly to caller's Tenant boundary
        const userResult = await db.query(
            'SELECT role FROM users WHERE id = $1 AND organization_id = $2',
            [targetUserId, request.orgId]
        );

        if (userResult.rows.length === 0) {
            return reply.code(404).send({ error: 'Not Found', message: 'User not found in context organization' });
        }

        const previousRole = userResult.rows[0].role;

        // 2. Privilege constraint: Do not allow self-elevation
        if (targetUserId === actorId) {
            return reply.code(403).send({ error: 'Forbidden', message: 'Separation of duties requires another Admin to modify your role.' });
        }

        // 3. Persist mutation
        const updateResult = await db.query(
            'UPDATE users SET role = $1 WHERE id = $2 AND organization_id = $3 RETURNING id, role, email',
            [newRole, targetUserId, request.orgId]
        );

        // 4. Force immutable audit logging
        await AuditService.log({
            organization_id: request.orgId,
            user_id: actorId,
            action: `user.role.update`,
            resource_type: 'user',
            resource_id: targetUserId,
            metadata: { previousRole, newRole }
        });

        // 5. Fire internal Event hook simulating device telemetry for Anomaly Modules
        const eventInput = {
            target_user_id: targetUserId,
            previous_role: previousRole,
            new_role: newRole,
            actor_id: actorId
        };
        const timestamp = Date.now();
        const hashInput = `INTERNAL_SYSTEM:user_role_updated:${timestamp}:${JSON.stringify(eventInput)}`;
        const integrityHash = computeIntegrityHash(hashInput);

        const eventResult = await db.query(
            `INSERT INTO events
                 (organization_id, device_id, event_type, payload, signature, integrity_hash, processed)
             VALUES ($1, NULL, $2, $3, $4, $5, false)
             RETURNING id`,
            [request.orgId, 'user_role_updated', eventInput, 'SYSTEM_INTERNAL', integrityHash],
        );

        await enqueueEvent(eventResult.rows[0].id, request.orgId);

        return reply.code(200).send({ message: 'Role updated successfully', data: updateResult.rows[0] });
    }

    static async deleteUser(request: FastifyRequest, reply: FastifyReply) {
        const { id: targetUserId } = request.params as { id: string };
        const { user_id: actorId } = request.user as JWTPayload;

        // 1. Fetch target user and verify org + role
        const userResult = await db.query(
            'SELECT role, is_active FROM users WHERE id = $1 AND organization_id = $2',
            [targetUserId, request.orgId]
        );

        if (userResult.rows.length === 0) {
            return reply.code(404).send({ error: 'Not Found', message: 'User not found in context organization' });
        }

        const targetUser = userResult.rows[0];

        // 2. Safety Constraints
        if (targetUserId === actorId) {
            return reply.code(400).send({ error: 'Bad Request', message: 'You cannot delete your own account.' });
        }

        if (targetUser.role === 'org_admin') {
            return reply.code(403).send({ error: 'Forbidden', message: 'Organization Admins cannot be deleted via this endpoint.' });
        }

        if (!targetUser.is_active) {
            return reply.code(400).send({ error: 'Bad Request', message: 'User is already inactive/deleted.' });
        }

        // 3. Execution (Soft Delete)
        await db.query(
            'UPDATE users SET is_active = false WHERE id = $1 AND organization_id = $2',
            [targetUserId, request.orgId]
        );

        // 4. Audit Log
        await AuditService.log({
            organization_id: request.orgId,
            user_id: actorId,
            action: 'user.delete',
            resource_type: 'user',
            resource_id: targetUserId,
            metadata: { targetRole: targetUser.role }
        });

        // 5. Fire internal Event hook
        const timestamp = Date.now();
        const eventInput = { target_user_id: targetUserId, actor_id: actorId, role: targetUser.role };
        const hashInput = `INTERNAL_SYSTEM:user_deleted:${timestamp}:${JSON.stringify(eventInput)}`;
        const integrityHash = computeIntegrityHash(hashInput);

        const eventResult = await db.query(
            `INSERT INTO events
                 (organization_id, device_id, event_type, payload, signature, integrity_hash, processed)
             VALUES ($1, NULL, $2, $3, $4, $5, false)
             RETURNING id`,
            [request.orgId, 'user_deleted', eventInput, 'SYSTEM_INTERNAL', integrityHash],
        );

        await enqueueEvent(eventResult.rows[0].id, request.orgId);

        return reply.code(200).send({ message: 'User deleted and account disabled successfully' });
    }
}
