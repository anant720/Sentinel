import api from '../api';

export const AuthService = {
  login: async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    return data;
  },

  logout: async () => {
    await api.post('/auth/logout');
  },

  getMe: async () => {
    const { data } = await api.get('/auth/me');
    return data;
  },

  acceptInvite: async (payload: { invite_token: string; full_name: string; password: string }) => {
    const { data } = await api.post('/organizations/accept-invite', payload);
    return data;
  },
};
