export interface JWTPayload {
    user_id: string;
    organization_id: string;
    role: string;
}

declare module 'fastify' {
    interface FastifyRequest {
        /**
         * Populated by auth.middleware after JWT verification.
         * Contains the raw decoded token claims.
         */
        user: JWTPayload;

        /**
         * Populated by org-isolation.middleware immediately after auth.
         * Always extracted from the JWT — never from client input.
         * Use this in all controllers and services. Never read req.body.organization_id.
         */
        orgId: string;
    }
}
