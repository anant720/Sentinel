import { describe, it, expect } from 'vitest';
import { Role, Permission, RolePermissions, roleHasPermission, isValidRole } from '../src/rbac/index.js';

describe('RBAC Hierarchy and Matrix Integrity', () => {

    it('isValidRole allows only defined roles', () => {
        expect(isValidRole(Role.ORG_ADMIN)).toBe(true);
        expect(isValidRole(Role.SECURITY_ANALYST)).toBe(true);
        expect(isValidRole(Role.VIEWER)).toBe(true);

        expect(isValidRole('SUPERADMIN')).toBe(false);
        expect(isValidRole('')).toBe(false);
    });

    it('ORG_ADMIN implicitly holds all available permissions defined in the system', () => {
        const adminPermissions = RolePermissions[Role.ORG_ADMIN];
        const allPermissions = Object.values(Permission);

        allPermissions.forEach(permission => {
            expect(adminPermissions.includes(permission)).toBe(true);
        });

        expect(adminPermissions.length).toBe(allPermissions.length);
    });

    it('SECURITY_ANALYST specific constraints for incident response isolation', () => {
        // Can read events and triage alerts
        expect(roleHasPermission(Role.SECURITY_ANALYST, Permission.EVENT_READ)).toBe(true);
        expect(roleHasPermission(Role.SECURITY_ANALYST, Permission.ALERT_READ)).toBe(true);
        expect(roleHasPermission(Role.SECURITY_ANALYST, Permission.ALERT_UPDATE)).toBe(true);

        // CANNOT register devices, generate enrollment tokens, or change tenant configurations
        expect(roleHasPermission(Role.SECURITY_ANALYST, Permission.DEVICE_REGISTER)).toBe(false);
        expect(roleHasPermission(Role.SECURITY_ANALYST, Permission.DEVICE_ENROLL_TOKEN)).toBe(false);
        expect(roleHasPermission(Role.SECURITY_ANALYST, Permission.ORG_UPDATE)).toBe(false);
        expect(roleHasPermission(Role.SECURITY_ANALYST, Permission.AUDIT_READ)).toBe(false);
    });

    it('VIEWER is strictly read-only and denied explicit state modification', () => {
        const viewerPermissions = RolePermissions[Role.VIEWER];
        expect(viewerPermissions.includes(Permission.ORG_READ)).toBe(true);
        expect(viewerPermissions.includes(Permission.EVENT_READ)).toBe(true);
        expect(viewerPermissions.includes(Permission.USER_READ)).toBe(true);
        expect(viewerPermissions.includes(Permission.DEVICE_READ)).toBe(true);
        expect(viewerPermissions.includes(Permission.ALERT_READ)).toBe(true);

        const readOnlyCheck = viewerPermissions.every(p => p.includes(':read'));
        expect(readOnlyCheck).toBe(true);
    });
});
