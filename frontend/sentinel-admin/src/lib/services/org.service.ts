import api from '../api';

export const OrgService = {
  getUsers: async () => {
    const { data } = await api.get('/users');
    return data;
  },

  deleteUser: async (id: string) => {
    const { data } = await api.delete(`/users/${id}`);
    return data;
  },

  updateUserRole: async (id: string, role: string) => {
    const { data } = await api.patch(`/users/${id}/role`, { role });
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
    const { data } = await api.post('/organizations/invite', payload);
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
    return data;
  },

  updateSettings: async (settings: Record<string, any>) => {
    const { data } = await api.patch('/organizations/settings', settings);
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
