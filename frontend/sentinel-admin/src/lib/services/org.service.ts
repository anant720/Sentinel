import api from '../api';
import { useAuthStore } from '../store';
import { CryptoService } from './crypto.service';

/**
 * Derives the correct password to send for privileged actions.
 * For E2EE users (v2), password must be PBKDF2 hashed client-side first.
 * For legacy users (v1), password is sent as-is (bcrypt comparison on server).
 */
async function derivePrivilegedPassword(rawPassword: string): Promise<string> {
  const store = useAuthStore.getState();
  // Check if the logged-in user is an E2EE (v2) user via the dedicated store field
  const isE2EE = store.e2eeEnabled;
  if (!isE2EE) return rawPassword;
  // Use the same SHA-256 client-hash as the login flow
  try {
    const derived = await CryptoService.hashPasswordForAuth(rawPassword);
    return derived;
  } catch {
    return rawPassword;
  }
}

export const OrgService = {
  getUsers: async () => {
    const { data } = await api.get('/users');
    return data;
  },

  deleteUser: async (id: string, password: string) => {
    const derivedPassword = await derivePrivilegedPassword(password);
    const { data } = await api.delete(`/users/${id}`, { data: { password: derivedPassword } });
    return data;
  },

  updateUserRole: async (id: string, role: string, password: string) => {
    const derivedPassword = await derivePrivilegedPassword(password);
    const { data } = await api.patch(`/users/${id}/role`, { role, password: derivedPassword });
    return data;
  },

  getApiKeys: async () => {
    const { data } = await api.get('/organizations/api-keys');
    return data;
  },

  createApiKey: async (payload: { rate_limit_per_minute?: number } = {}) => {
    const { data } = await api.post('/organizations/api-keys', payload);
    return data;
  },

  deleteApiKey: async (id: string) => {
    await api.delete(`/organizations/api-keys/${id}`);
  },

  getInvitations: async () => {
    const { data } = await api.get('/organizations/invitations');
    return data;
  },

  invite: async (payload: { email: string; role: string }) => {
    const { data } = await api.post('/organizations/invite', { email: payload.email, role: payload.role });
    return data;
  },

  deleteInvitation: async (id: string) => {
    await api.delete(`/organizations/invitations/${id}`);
  },

  getMe: async () => {
    const { data } = await api.get('/auth/me');
    return data;
  },

  getSettings: async () => {
    const { data } = await api.get('/organizations/settings');
    const masterKey = useAuthStore.getState().masterKey;
    if (!masterKey) return data;

    // Decrypt configs if they are encrypted strings
    const decryptedData: Record<string, any> = { ...data.data };
    for (const moduleId of Object.keys(decryptedData)) {
      const module = decryptedData[moduleId];
      // Check if the config itself is a string (encrypted)
      if (typeof module === 'string' || (module && typeof module.config === 'string')) {
        const cipherText = typeof module === 'string' ? module : module.config;
        const decrypted = await CryptoService.decryptPayload(cipherText, masterKey);
        if (decrypted) {
          decryptedData[moduleId] = { ...module, ...decrypted, is_e2ee: true };
        }
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

    // Encrypt each module's config before sending
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

  /** Downloads audit logs as a CSV blob and triggers browser download */
  exportAuditLogs: async () => {
    const response = await api.get('/organizations/audit-logs/export', {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `audit_logs_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  getAuditLogs: async (params: { limit?: number; offset?: number } = {}) => {
    const { data } = await api.get('/organizations/audit-logs', { params });
    const masterKey = useAuthStore.getState().masterKey;
    if (!masterKey) return data;

    // Decrypt metadata if it is an encrypted string
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
