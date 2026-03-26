import api from '../api';
import { useAuthStore } from '../store';
import { CryptoService } from './crypto.service';

async function derivePrivilegedPassword(rawPassword: string): Promise<string> {
  const isE2EE = useAuthStore.getState().e2eeEnabled;
  if (!isE2EE) return rawPassword;
  try { return await CryptoService.hashPasswordForAuth(rawPassword); } catch { return rawPassword; }
}

export const OrgService = {
  getUsers: async () => { const { data } = await api.get('/users'); return data; },
  deleteUser: async (id: string, password: string) => {
    const pw = await derivePrivilegedPassword(password);
    const { data } = await api.delete(`/users/${id}`, { data: { password: pw } });
    return data;
  },
  updateUserRole: async (id: string, role: string, password: string) => {
    const pw = await derivePrivilegedPassword(password);
    const { data } = await api.patch(`/users/${id}/role`, { role, password: pw });
    return data;
  },
  getApiKeys: async () => { const { data } = await api.get('/organizations/api-keys'); return data; },
  createApiKey: async (rateLimitPerMinute: number = 1000) => {
    const { data } = await api.post('/organizations/api-keys', { rate_limit_per_minute: rateLimitPerMinute });
    return data;
  },
  deleteApiKey: async (id: string) => { await api.delete(`/organizations/api-keys/${id}`); },
  getInvitations: async () => { const { data } = await api.get('/organizations/invitations'); return data; },
  invite: async (payload: { email: string; role: string }) => {
    const { data } = await api.post('/organizations/invite', payload);
    return data;
  },
  deleteInvitation: async (id: string) => { await api.delete(`/organizations/invitations/${id}`); },
  getMe: async () => { const { data } = await api.get('/auth/me'); return data; },
  getSettings: async () => {
    const { data } = await api.get('/organizations/settings');
    const masterKey = useAuthStore.getState().masterKey;
    if (!masterKey) return data;
    const decryptedData: Record<string, any> = { ...data.data };
    for (const moduleId of Object.keys(decryptedData)) {
      const module = decryptedData[moduleId];
      if (typeof module === 'string' || (module && typeof module.config === 'string')) {
        const cipherText = typeof module === 'string' ? module : module.config;
        const decrypted = await CryptoService.decryptPayload(cipherText, masterKey);
        if (decrypted) decryptedData[moduleId] = { ...module, ...decrypted, is_e2ee: true };
      }
    }
    return { data: decryptedData };
  },
  updateSettings: async (settings: Record<string, any>) => {
    const masterKey = useAuthStore.getState().masterKey;
    if (!masterKey) {
      const { data } = await api.patch('/organizations/settings', settings);
      return data;
    }
    const encryptedSettings: Record<string, any> = {};
    for (const moduleId of Object.keys(settings)) {
      const { enabled, ...config } = settings[moduleId];
      const cipherText = await CryptoService.encryptPayload(config, masterKey);
      encryptedSettings[moduleId] = { enabled, config: cipherText };
    }
    const { data } = await api.patch('/organizations/settings', encryptedSettings);
    return data;
  },
  deleteOrganization: async (id: string, payload: { password: string; orgName: string }) => {
    const { data } = await api.delete(`/organizations/${id}`, { data: payload });
    return data;
  },
  exportAuditLogs: async () => {
    const response = await api.get('/organizations/audit-logs/export', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  getAuditLogs: async (params: { limit?: number; offset?: number } = {}) => {
    const { data } = await api.get('/organizations/audit-logs', { params });
    const masterKey = useAuthStore.getState().masterKey;
    if (!masterKey) return data;
    const decryptedRows = await Promise.all(data.data.map(async (row: any) => {
      if (typeof row.metadata === 'string') {
        const decrypted = await CryptoService.decryptPayload(row.metadata, masterKey);
        return { ...row, metadata: decrypted || row.metadata, is_e2ee: !!decrypted };
      }
      return row;
    }));
    return { data: decryptedRows };
  },
  getNotifications: async (limit = 50) => {
    const { data } = await api.get('/notifications', { params: { limit } });
    return data;
  },
  markNotificationRead: async (id: string) => {
    const { data } = await api.patch(`/notifications/${id}/read`);
    return data;
  },
  clearNotifications: async () => {
    const { data } = await api.delete('/notifications');
    return data;
  },
};
