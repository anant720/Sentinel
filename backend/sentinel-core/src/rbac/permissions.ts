/**
 * src/rbac/permissions.ts
 * ────────────────────────
 * Single source of truth for all permission definitions.
 *
 * RULES:
 *  - Permissions are named by action (verb:resource), not by role
 *  - RolePermissions is the ONLY place that maps roles to permissions
 *  - No conditional permission logic anywhere else in the codebase
 *  - Adding a new capability = add a Permission enum member + update matrix
 */
import { Role } from './roles.js';

// ── Permission enum ──────────────────────────────────────────────────────────

export enum Permission {
    // Organization
    ORG_CREATE = 'org:create',
    ORG_READ = 'org:read',
    ORG_UPDATE = 'org:update',
    ORG_DELETE = 'org:delete',

    // Devices
    DEVICE_REGISTER = 'device:register',    // Self-registration via API key
    DEVICE_ENROLL_TOKEN = 'device:enroll-token', // Generate enrollment token
    DEVICE_READ = 'device:read',

    // Events
    EVENT_INGEST = 'event:ingest',
    EVENT_READ = 'event:read',

    // Users
    USER_MANAGE = 'user:manage',
    USER_READ = 'user:read',

    // Audit
    AUDIT_READ = 'audit:read',

    // Alerts
    ALERT_READ = 'alert:read',
    ALERT_UPDATE = 'alert:update',

    // API Keys
    API_KEY_MANAGE = 'apikey:manage',

    // Settings
    SETTINGS_MANAGE = 'settings:manage',
}

// ── Permission matrix ─────────────────────────────────────────────────────────

/**
 * Maps every Role to the exact set of Permissions it holds.
 * This is the SINGLE source of authorization truth.
 * Any permission not listed here is implicitly denied.
 */
export const RolePermissions: Record<Role, Permission[]> = {
    [Role.ORG_ADMIN]: [
        Permission.ORG_CREATE,
        Permission.ORG_READ,
        Permission.ORG_UPDATE,
        Permission.ORG_DELETE,
        Permission.DEVICE_REGISTER,
        Permission.DEVICE_ENROLL_TOKEN,
        Permission.DEVICE_READ,
        Permission.EVENT_INGEST,
        Permission.EVENT_READ,
        Permission.USER_MANAGE,
        Permission.USER_READ,
        Permission.AUDIT_READ,
        Permission.ALERT_READ,
        Permission.ALERT_UPDATE,
        Permission.API_KEY_MANAGE,
        Permission.SETTINGS_MANAGE,
    ],
    [Role.SECURITY_ANALYST]: [
        Permission.ORG_READ,
        Permission.DEVICE_READ,
        Permission.EVENT_INGEST,
        Permission.EVENT_READ,
        Permission.USER_READ,
        Permission.ALERT_READ,
        Permission.ALERT_UPDATE,
    ],
    [Role.VIEWER]: [
        Permission.ORG_READ,
        Permission.DEVICE_READ,
        Permission.EVENT_READ,
        Permission.USER_READ,
        Permission.ALERT_READ,  // Viewers can read alerts (but not update)
    ],
};

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Returns true if the given role has the specified permission.
 * Pure function — no DB access, no side effects.
 */
export function roleHasPermission(role: Role, permission: Permission): boolean {
    const granted = RolePermissions[role];
    return granted !== undefined && granted.includes(permission);
}
