/**
 * src/lib/rbac.ts
 * ─────────────────────────────────
 * Frontend RBAC: mirrors the backend permission matrix.
 * All role checks must go through these helpers — no inline string comparisons.
 */
import { useAuthStore } from './store';

export type Role = 'org_admin' | 'security_analyst' | 'viewer';

/**
 * Returns the current user's role from the auth store.
 */
export function useRole(): Role | null {
  const user = useAuthStore((s) => s.user);
  return (user?.role as Role) ?? null;
}

/**
 * useRoleAccess — returns a set of boolean flags for the current user's capabilities.
 * Use these flags to show/hide UI elements.
 */
export function useRoleAccess() {
  const role = useRole();

  const isAdmin = role === 'org_admin';
  const isAnalyst = role === 'security_analyst';
  const isViewer = role === 'viewer';

  return {
    // Navigation
    canViewManagement: isAdmin,           // Organizations, Identity, Detection Logic, Settings
    
    // Alerts
    canUpdateAlerts: isAdmin || isAnalyst, // Resolve, Acknowledge, Dismiss
    canViewAlerts: true,                   // Everyone can view

    // Events
    canViewEvents: true,                  // Everyone

    // Users
    canManageUsers: isAdmin,              // Invite, Delete, Change Role
    
    // API Keys
    canManageApiKeys: isAdmin,

    // Detection / Settings
    canManageSettings: isAdmin,
    canViewSettings: isAdmin,

    // Audit
    canExportLogs: isAdmin,

    // Raw role
    role,
    isAdmin,
    isAnalyst,
    isViewer,
  };
}
