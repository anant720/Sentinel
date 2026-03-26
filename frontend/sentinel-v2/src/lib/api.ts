import axios from 'axios';
import { useAuthStore } from './store';
import { generateDeviceId } from './device';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

let cachedDeviceId: string | null = null;
generateDeviceId().then(id => (cachedDeviceId = id)).catch(console.error);

api.interceptors.request.use(
  async (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (!config.headers['X-Device-Fingerprint']) {
      if (!cachedDeviceId) cachedDeviceId = await generateDeviceId();
      config.headers['X-Device-Fingerprint'] = cachedDeviceId;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const isLoginRequest = error.config.url?.includes('/auth/login');
    if (error.response?.status === 401 && !error.config._retry && !isLoginRequest) {
      const msg = error.response?.data?.message || '';
      if (msg.includes('Concurrent Session') || msg.includes('Token Hijacking')) {
        useAuthStore.getState().logout();
        window.location.href = '/login?error=session_terminated';
        return Promise.reject(error);
      }
      error.config._retry = true;
      try {
        const userId = useAuthStore.getState().user?.id;
        if (!userId) {
          useAuthStore.getState().logout();
          window.location.href = '/login';
          return Promise.reject(error);
        }
        const { data } = await api.post('/auth/refresh', { user_id: userId });
        if (data.accessToken) {
          useAuthStore.getState().setAccessToken(data.accessToken);
          return api(error.config);
        }
      } catch {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
