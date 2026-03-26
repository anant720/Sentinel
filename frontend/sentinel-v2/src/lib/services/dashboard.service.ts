import api from '../api';

export const DashboardService = {
  getStats: async () => {
    const { data } = await api.get('/dashboard/stats');
    return data;
  },
  getRiskTrend: async () => {
    const { data } = await api.get('/dashboard/risk-trend');
    return data;
  },
  getHistoricalRisk: async (range: '1d' | '15d' | '1m' = '1d') => {
    const { data } = await api.get('/dashboard/risk/historical', { params: { range } });
    return data;
  },
  getLiveFeed: async () => {
    const { data } = await api.get('/events');
    return data;
  },
  runScan: async () => {
    const { data } = await api.post('/security/scan');
    return data;
  },
};
