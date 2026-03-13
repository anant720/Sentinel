/**
 * src/rbac/roles.ts
 * ──────────────────
 * Single source of truth for all role definitions.
 *
 * RULES:
 *  - Role is a TypeScript enum — no string literals elsewhere
 *  - ROLE_HIERARCHY is used ONLY inside the RBAC layer (middleware)
 *  - Services and controllers must never reference Role directly
 */

export enum Role {
    ORG_ADMIN = 'org_admin',
    SECURITY_ANALYST = 'security_analyst',
    VIEWER = 'viewer',
}

/**
 * Numeric weight per role.
 * Used internally by the RBAC layer to determine if a role satisfies
 * a minimum requirement. Not used for permission checks.
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
    [Role.ORG_ADMIN]: 100,
    [Role.SECURITY_ANALYST]: 50,
    [Role.VIEWER]: 10,
};

/**
 * Assert that a decoded string value is a valid Role.
 * Used during JWT payload validation.
 */
export function isValidRole(value: unknown): value is Role {
    return Object.values(Role).includes(value as Role);
}
