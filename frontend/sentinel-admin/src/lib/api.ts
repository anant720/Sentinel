import axios from 'axios';
import { useAuthStore } from './store';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
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
    const isLoginRequest = error.config.url?.includes('/auth/login');
    
    if (error.response?.status === 401 && !error.config._retry && !isLoginRequest) {
      error.config._retry = true;
      try {
        const userId = useAuthStore.getState().user?.id;
        if (!userId) {
             useAuthStore.getState().logout();
             window.location.href = '/login';
             return Promise.reject(error);
        }
        // Call refresh via the configured API baseURL
        const { data } = await api.post('/auth/refresh', { user_id: userId });
        
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
