import api from '../api';

export const AlertService = {
  getAlerts: async (params?: { status?: string; limit?: number }) => {
    const { data } = await api.get('/alerts', { params });
    return data;
  },

  updateStatus: async (id: string, status: string, note?: string) => {
    const { data } = await api.patch(`/alerts/${id}/status`, { status, note });
    return data;
  },

  acknowledge: async (id: string, note?: string) => {
    const { data } = await api.patch(`/alerts/${id}/acknowledge`, { note });
    return data;
  },

  resolve: async (id: string, note?: string) => {
    const { data } = await api.patch(`/alerts/${id}/resolve`, { note });
    return data;
  },

  dismiss: async (id: string, note?: string) => {
    const { data } = await api.patch(`/alerts/${id}/dismiss`, { note });
    return data;
  },
};
