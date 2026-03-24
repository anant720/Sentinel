import api from '../api';
import { CryptoService } from './crypto.service';
import { useAuthStore } from '../store';
import { generateDeviceId } from '../device';

export const AuthService = {
  login: async (email: string, password: string) => {
    // 1. Client-side PRE-HASHING (True E2EE for passwords)
    const clientHash = await CryptoService.hashPasswordForAuth(password);
    
    // 2. Derive the Master Key for data encryption (never leaves the browser)
    const masterKey = await CryptoService.deriveMasterKey(password, email);
    useAuthStore.getState().setMasterKey(masterKey);

    // 3. Generate stable device fingerprint for new-device detection
    const device_id = await generateDeviceId();

    // 4. Send the hash to the server. 
    // If the server returns E2EE = legacy, we may need to send the raw password for backward compatibility
    // during the initial migration login.
    try {
      const { data } = await api.post('/auth/login', { 
        email, 
        password: clientHash, // Server receives SHA-256 hash
        is_client_hashed: true,
        device_id,
      });
      return data;
    } catch (err: any) {
      // BACKWARD COMPATIBILITY: If hashing fails (account is still legacy), fallback to raw password
      if (err.response?.status === 401 || err.response?.status === 400) {
         const { data } = await api.post('/auth/login', { email, password, device_id });
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
    // Hash password client-side for E2EE starting from account activation
    const clientHash = await CryptoService.hashPasswordForAuth(payload.password);
    const { data } = await api.post('/organizations/accept-invite', {
      ...payload,
      password: clientHash
    });
    return data;
  },
};
