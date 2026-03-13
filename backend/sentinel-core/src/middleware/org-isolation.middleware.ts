/**
 * src/middleware/org-isolation.middleware.ts
 * ──────────────────────────────────────────
 * Security-critical middleware.
 *
 * Runs AFTER auth.middleware (JWT is already verified).
 * Extracts organization_id from the verified JWT payload and attaches
 * it to req.orgId. Rejects any request that lacks an org context.
 *
 * HARD RULES:
 *  - NEVER read organization_id from req.body / req.params / req.query
 *  - NEVER allow the client to supply their own orgId
 *  - req.orgId is always sourced exclusively from the JWT
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { JWTPayload } from './auth.middleware.js';

export async function orgIsolationMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const user = request.user as JWTPayload;

    if (!user?.organization_id) {
        reply.code(403).send({
            error: 'Forbidden',
            message: 'Organization context missing. Ensure you are authenticated with a valid org-scoped token.',
        });
        return;
    }

    // Attach org identity to the request — this is the ONLY source of truth
    request.orgId = user.organization_id;
}
