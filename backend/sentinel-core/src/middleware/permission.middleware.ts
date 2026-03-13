/**
 * src/middleware/permission.middleware.ts
 * ────────────────────────────────────────
 * Authorization middleware — the ONLY place permission checks occur.
 *
 * PATTERN:
 *   permissionMiddleware(Permission.DEVICE_READ)
 *
 * RULES:
 *  - Reads req.user.role (set by auth.middleware after JWT validation)
 *  - Checks the role against the RolePermissions matrix (single source of truth)
 *  - Returns 403 if permission is not granted — does NOT leak which permission failed
 *  - No DB lookups, no org logic, no business logic
 *  - Decision is binary: allow or deny
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { Role, Permission, RolePermissions, isValidRole } from '../rbac/index.js';
import { AccessTokenPayload } from '../security/index.js';

export { Role, Permission };

/**
 * Returns a preHandler that enforces the given required permission.
 * Routes declare their required permission at registration time:
 *
 * @example
 *   instance.get('/devices/:id', { preHandler: permissionMiddleware(Permission.DEVICE_READ) }, handler)
 */
export function permissionMiddleware(requiredPermission: Permission) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const user = request.user as AccessTokenPayload;

        // Auth middleware should have already set user — fail fast if not
        if (!user?.role) {
            reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
            return;
        }

        // Validate the role value from the JWT is a known Role enum member
        if (!isValidRole(user.role)) {
            reply.code(403).send({ error: 'Forbidden' });
            return;
        }

        const role = user.role as Role;
        const granted = RolePermissions[role];

        if (!granted || !granted.includes(requiredPermission)) {
            // Return 403 without revealing which permission was required
            reply.code(403).send({ error: 'Forbidden' });
            return;
        }
    };
}
