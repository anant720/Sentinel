import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  masterKey: CryptoKey | null;
  e2eeEnabled: boolean;
  setUser: (user: User | null) => void;
  setAccessToken: (token: string | null) => void;
  setAuthenticated: (status: boolean) => void;
  setMasterKey: (key: CryptoKey | null) => void;
  setE2eeEnabled: (status: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      masterKey: null,
      e2eeEnabled: false,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setAuthenticated: (status) => set({ isAuthenticated: status }),
      setMasterKey: (masterKey) => set({ masterKey }),
      setE2eeEnabled: (e2eeEnabled) => set({ e2eeEnabled }),
      logout: () => set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        masterKey: null,
        e2eeEnabled: false,
      }),
    }),
    {
      name: 'sentinel-auth-storage',
      version: 3,
      // CRITICAL: masterKey is NEVER persisted
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
        e2eeEnabled: state.e2eeEnabled,
      }),
    }
  )
);
