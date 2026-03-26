import api from '../api';
import { CryptoService } from './crypto.service';
import { useAuthStore } from '../store';
import { generateDeviceId } from '../device';

// Backend login returns { accessToken, e2ee } — NO user object.
// After login we set the token, then fetch /auth/me to hydrate the user.
export const AuthService = {
  login: async (email: string, password: string) => {
    const device_id = await generateDeviceId();

    // Derive master key BEFORE the network call (so it's ready for decryption)
    const masterKey = await CryptoService.deriveMasterKey(password, email);

    let loginData: { accessToken: string; e2ee: { enabled: boolean; version: string } };

    // Try E2EE-hashed login first (v2 accounts)
    const clientHash = await CryptoService.hashPasswordForAuth(password);
    try {
      const { data } = await api.post('/auth/login', {
        email,
        password: clientHash,
        is_client_hashed: true,
        device_id,
      });
      loginData = data;
    } catch (err: any) {
      if (err.response?.status === 401 || err.response?.status === 400) {
        // Fall back to plain password (v1 accounts)
        const { data } = await api.post('/auth/login', { email, password, device_id });
        loginData = data;
      } else {
        throw err;
      }
    }

    // Step 1: Persist the access token so subsequent requests are authenticated
    useAuthStore.getState().setAccessToken(loginData.accessToken);

    // Step 2: Set master key if E2EE is enabled
    if (loginData.e2ee?.enabled) {
      useAuthStore.getState().setMasterKey(masterKey);
      useAuthStore.getState().setE2eeEnabled(true);
    }

    // Step 3: Fetch full user profile now that we have a valid token
    // Backend /auth/me returns: { user: { id, email, name, role, organization_id, organization: {...} } }
    const { data: meResponse } = await api.get('/auth/me');
    const user = meResponse?.user || meResponse;

    // Step 4: Set user (this also sets isAuthenticated = true via setUser)
    useAuthStore.getState().setUser(user);
    useAuthStore.getState().setE2eeEnabled(loginData.e2ee?.enabled || user?.e2ee_enabled || false);

    return { user, accessToken: loginData.accessToken, e2ee: loginData.e2ee };
  },

  upgradeToE2EE: async (password: string) => {
    const clientHash = await CryptoService.hashPasswordForAuth(password);
    const { data } = await api.post('/auth/upgrade-e2ee', { client_hash: clientHash });
    return data;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore — tokens already cleared on client
    }
  },

  getMe: async () => {
    const { data } = await api.get('/auth/me');
    // Backend returns { user: { id, email, name, role, ... } }
    return data?.user || data;
  },

  acceptInvite: async (payload: { invite_token: string; full_name: string; password: string }) => {
    const clientHash = await CryptoService.hashPasswordForAuth(payload.password);
    const { data } = await api.post('/organizations/accept-invite', {
      ...payload,
      password: clientHash,
    });
    return data;
  },
};
