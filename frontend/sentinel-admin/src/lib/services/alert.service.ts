import api from '../api';
import { useAuthStore } from '../store';
import { CryptoService } from './crypto.service';

export const AlertService = {
  getAlerts: async (params?: { status?: string; limit?: number }) => {
    const { data } = await api.get('/alerts', { params });
    const masterKey = useAuthStore.getState().masterKey;
    if (!masterKey) return data;

    // Decrypt evidence if it is an encrypted string
    const decryptedRows = await Promise.all(data.data.map(async (row: any) => {
      if (typeof row.evidence === 'string') {
        const decrypted = await CryptoService.decryptPayload(row.evidence, masterKey);
        return { ...row, evidence: decrypted || row.evidence, is_e2ee: !!decrypted };
      }
      return row;
    }));

    return { data: decryptedRows };
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
