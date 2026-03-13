import axios from 'axios';
import { useAuthStore } from './store';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Attach Authorization header
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      try {
        const userId = useAuthStore.getState().user?.id;
        if (!userId) {
             useAuthStore.getState().logout();
             window.location.href = '/login';
             return Promise.reject(error);
        }
        // Call refresh via the proxy too
        const { data } = await axios.post('/api/auth/refresh', { user_id: userId }, { withCredentials: true });
        
        if (data.accessToken) {
          useAuthStore.getState().setAccessToken(data.accessToken);
          return api(error.config);
        }
      } catch (refreshError) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
