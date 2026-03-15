/**
 * Authentication utilities
 * Handles login/logout with the backend API and stores auth state persistently in electron-store
 */
import { networkInterfaces } from 'node:os';
import { proxyAwareFetch } from './proxy-fetch';

const BACKEND_URL = 'http://127.0.0.1:8080';

// Lazy-load electron-store for auth persistence
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let authStoreInstance: any = null;

interface UserProfile {
  id: number;
  username: string;
  phone: string;
  mac_address: string | null;
  avatar: string | null;
  created_at: string;
}

interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  expiresAt: number | null;
}

/**
 * Get the auth store instance (lazy initialization)
 */
async function getAuthStore() {
  if (!authStoreInstance) {
    const Store = (await import('electron-store')).default;
    authStoreInstance = new Store<AuthState>({
      name: 'auth',
      defaults: {
        token: null,
        user: null,
        expiresAt: null,
      },
    });
  }
  return authStoreInstance;
}

/**
 * Get the MAC address of the first non-internal network interface
 * Format: XX:XX:XX:XX:XX:XX
 */
export function getMacAddress(): string {
  const interfaces = networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;

    for (const info of iface) {
      // Skip internal interfaces and non-IPv4
      if (!info.internal && info.family === 'IPv4' && info.mac) {
        return info.mac.toUpperCase();
      }
    }
  }

  // Fallback: generate a fake MAC if none found (shouldn't happen on real systems)
  return '00:00:00:00:00:00';
}

/**
 * Get current auth state from persistent storage
 */
export async function getAuthState(): Promise<AuthState> {
  const store = await getAuthStore();
  const state = store.store as AuthState;

  // Check if token is expired
  if (state.expiresAt && Date.now() > state.expiresAt) {
    await logout();
    return { token: null, user: null, expiresAt: null };
  }

  return state;
}

/**
 * Login with username and password
 * Returns the login response or throws an error with specific error type
 */
export async function login(
  username: string,
  password: string
): Promise<{ success: true; data: LoginResponse } | { success: false; error: 'invalid_credentials' | 'device_bound' | 'network_error' | 'server_error'; message: string }> {
  try {
    const macAddress = getMacAddress();

    const response = await proxyAwareFetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
        mac_address: macAddress,
      }),
    });

    if (response.ok) {
      const data = await response.json() as LoginResponse;

      // Store auth state persistently
      const store = await getAuthStore();
      store.set({
        token: data.access_token,
        user: data.user,
        expiresAt: Date.now() + data.expires_in * 1000,
      });

      return { success: true, data };
    }

    // Handle error responses
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    const errorMessage = errorData.detail || 'Login failed';

    // Map HTTP status and error message to error types
    if (response.status === 401) {
      return {
        success: false,
        error: 'invalid_credentials',
        message: errorMessage,
      };
    }

    if (response.status === 403) {
      if (errorMessage.includes('bound') || errorMessage.includes('device')) {
        return {
          success: false,
          error: 'device_bound',
          message: errorMessage,
        };
      }
      return {
        success: false,
        error: 'invalid_credentials',
        message: errorMessage,
      };
    }

    return {
      success: false,
      error: 'server_error',
      message: errorMessage,
    };
  } catch (error) {
    return {
      success: false,
      error: 'network_error',
      message: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Logout and clear auth state
 * Calls backend logout endpoint to invalidate token, then clears local state
 */
export async function logout(): Promise<void> {
  const store = await getAuthStore();
  const currentToken = store.get('token') as string | null;

  // Call backend logout endpoint if token exists
  if (currentToken) {
    try {
      await proxyAwareFetch(`${BACKEND_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      // Log error but still clear local state even if backend call fails
      console.error('Backend logout failed:', error);
    }
  }

  // Clear auth state in persistent storage
  store.set({
    token: null,
    user: null,
    expiresAt: null,
  });
}

/**
 * Check if user is logged in
 */
export async function isLoggedIn(): Promise<boolean> {
  const state = await getAuthState();
  return state.token !== null && state.user !== null;
}

/**
 * Get current user
 */
export async function getCurrentUser(): Promise<UserProfile | null> {
  const state = await getAuthState();
  return state.user;
}

/**
 * Get access token
 */
export async function getAccessToken(): Promise<string | null> {
  const state = await getAuthState();
  return state.token;
}

/**
 * Unbind MAC address from user account
 * Requires authentication
 */
export async function unbindMacAddress(): Promise<{ success: true } | { success: false; error: 'not_logged_in' | 'not_bound' | 'server_error'; message: string }> {
  try {
    const store = await getAuthStore();
    const token = store.get('token') as string | null;
    const user = store.get('user') as UserProfile | null;

    if (!token) {
      return {
        success: false,
        error: 'not_logged_in',
        message: 'Not logged in',
      };
    }

    // Check if user has a MAC address bound
    if (!user?.mac_address) {
      return {
        success: false,
        error: 'not_bound',
        message: 'No MAC address bound to this account',
      };
    }

    const response = await proxyAwareFetch(`${BACKEND_URL}/api/auth/unbind-mac`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      // Update local user state to clear MAC address
      store.set('user', {
        ...user,
        mac_address: null,
      });

      return { success: true };
    }

    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    return {
      success: false,
      error: 'server_error',
      message: errorData.detail || 'Failed to unbind MAC address',
    };
  } catch (error) {
    return {
      success: false,
      error: 'server_error',
      message: error instanceof Error ? error.message : 'Network error',
    };
  }
}
