/**
 * Auth State Store
 * Manages user authentication state in memory only
 * Persistent storage is handled by the main process (electron-store)
 */
import { create } from 'zustand';
import { invokeIpc } from '@/lib/api-client';

interface UserProfile {
  id: number;
  username: string;
  phone: string;
  mac_address: string | null;
  avatar: string | null;
  created_at: string;
}

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  expiresAt: number | null;
}

interface AuthStore extends AuthState {
  // Actions
  login: (username: string, password: string) => Promise<{ success: boolean; error?: 'invalid_credentials' | 'device_bound' | 'network_error' | 'server_error'; message?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  syncFromMain: () => Promise<void>;
  isLoggedIn: () => boolean;
  getToken: () => string | null;
  getUser: () => UserProfile | null;
  unbindDevice: () => Promise<{ success: boolean; error?: 'not_logged_in' | 'not_bound' | 'server_error'; message?: string }>;
}

export const useAuthStore = create<AuthStore>()(
  (set, get) => ({
    token: null,
    user: null,
    expiresAt: null,

    login: async (username: string, password: string) => {
      try {
        const result = await invokeIpc<{ success: true; data: { access_token: string; user: UserProfile; expires_in: number } } | { success: false; error: 'invalid_credentials' | 'device_bound' | 'network_error' | 'server_error'; message: string }>('auth:login', username, password);

        if (result.success && 'data' in result) {
          set({
            token: result.data.access_token,
            user: result.data.user,
            expiresAt: Date.now() + result.data.expires_in * 1000,
          });
          return { success: true };
        }

        return {
          success: false,
          error: result.error,
          message: result.message,
        };
      } catch (error) {
        return {
          success: false,
          error: 'network_error',
          message: error instanceof Error ? error.message : 'Network error',
        };
      }
    },

    logout: async () => {
      await invokeIpc('auth:logout');
      set({ token: null, user: null, expiresAt: null });
    },

    checkAuth: async () => {
      try {
        // Sync auth state from main process
        await get().syncFromMain();

        // Check if logged in after sync
        const { token, expiresAt } = get();
        if (!token) return false;
        if (expiresAt && Date.now() > expiresAt) {
          set({ token: null, user: null, expiresAt: null });
          return false;
        }
        return true;
      } catch {
        return false;
      }
    },

    syncFromMain: async () => {
      try {
        const state = await invokeIpc<AuthState>('auth:getState');
        set({
          token: state.token,
          user: state.user,
          expiresAt: state.expiresAt,
        });
      } catch (error) {
        console.error('Failed to sync auth state from main:', error);
        set({ token: null, user: null, expiresAt: null });
      }
    },

    isLoggedIn: () => {
      const { token, expiresAt } = get();
      if (!token) return false;
      if (expiresAt && Date.now() > expiresAt) {
        set({ token: null, user: null, expiresAt: null });
        return false;
      }
      return true;
    },

    getToken: () => {
      const { token, expiresAt } = get();
      if (!token) return null;
      if (expiresAt && Date.now() > expiresAt) {
        set({ token: null, user: null, expiresAt: null });
        return null;
      }
      return token;
    },

    getUser: () => {
      return get().user;
    },

    unbindDevice: async () => {
      const result = await invokeIpc<{ success: true } | { success: false; error: 'not_logged_in' | 'not_bound' | 'server_error'; message: string }>('auth:unbindDevice');

      if (result.success) {
        // Update local state to clear MAC address
        const { user } = get();
        if (user) {
          set({ user: { ...user, mac_address: null } });
        }
      }

      return result;
    },
  })
);
