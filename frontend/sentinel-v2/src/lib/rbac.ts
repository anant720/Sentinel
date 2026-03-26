import { useAuthStore } from './store';

export type Role = 'org_admin' | 'security_analyst' | 'viewer';

export function useRole(): Role | null {
  const user = useAuthStore((s) => s.user);
  return (user?.role as Role) ?? null;
}

export function useRoleAccess() {
  const role = useRole();
  const isAdmin = role === 'org_admin';
  const isAnalyst = role === 'security_analyst';
  const isViewer = role === 'viewer';
  return {
    canViewManagement: isAdmin,
    canUpdateAlerts: isAdmin || isAnalyst,
    canViewAlerts: true,
    canViewEvents: true,
    canManageUsers: isAdmin,
    canManageApiKeys: isAdmin,
    canManageSettings: isAdmin,
    canViewSettings: isAdmin,
    canExportLogs: isAdmin,
    role, isAdmin, isAnalyst, isViewer,
  };
}
