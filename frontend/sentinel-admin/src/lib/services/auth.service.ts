import api from '../api';
import { CryptoService } from './crypto.service';
import { useAuthStore } from '../store';

export const AuthService = {
  login: async (email: string, password: string) => {
    // 1. Client-side PRE-HASHING (True E2EE for passwords)
    const clientHash = await CryptoService.hashPasswordForAuth(password);
    
    // 2. Derive the Master Key for data encryption (never leaves the browser)
    const masterKey = await CryptoService.deriveMasterKey(password, email);
    useAuthStore.getState().setMasterKey(masterKey);

    // 3. Send the hash to the server. 
    // If the server returns E2EE = legacy, we may need to send the raw password for backward compatibility
    // during the initial migration login.
    try {
      const { data } = await api.post('/auth/login', { 
        email, 
        password: clientHash, // Server receives SHA-256 hash
        is_client_hashed: true 
      });
      return data;
    } catch (err: any) {
      // BACKWARD COMPATIBILITY: If hashing fails (account is still legacy), fallback to raw password
      // In a real "perfect" scenario, we'd check the account status first, 
      // but for this rollout, we'll try V2 first and fallback.
      if (err.response?.status === 401 || err.response?.status === 400) {
         const { data } = await api.post('/auth/login', { email, password });
         return data;
      }
      throw err;
    }
  },

  upgradeToE2EE: async (password: string) => {
    const clientHash = await CryptoService.hashPasswordForAuth(password);
    const { data } = await api.post('/auth/upgrade-e2ee', { client_hash: clientHash });
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
