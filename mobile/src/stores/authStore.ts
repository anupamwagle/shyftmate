import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export interface UserOut {
  id: string;
  email: string;
  full_name: string;
  role: string;
  org_id: string | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserOut | null;
  isOtpPending: boolean;
  isLoading: boolean;

  setTokens: (access: string, refresh: string) => Promise<void>;
  setUser: (user: UserOut) => void;
  setOtpPending: (pending: boolean) => void;
  logout: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

const ACCESS_TOKEN_KEY = 'gator_access_token';
const REFRESH_TOKEN_KEY = 'gator_refresh_token';
const USER_KEY = 'gator_user';

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  isOtpPending: false,
  isLoading: true,

  setTokens: async (access: string, refresh: string) => {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, access);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh);
    set({ accessToken: access, refreshToken: refresh });
  },

  setUser: (user: UserOut) => {
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)).catch(console.error);
    set({ user });
  },

  setOtpPending: (pending: boolean) => {
    set({ isOtpPending: pending });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      isOtpPending: false,
    });
  },

  loadFromStorage: async () => {
    try {
      const [access, refresh, userJson] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);
      const user = userJson ? (JSON.parse(userJson) as UserOut) : null;
      set({
        accessToken: access,
        refreshToken: refresh,
        user,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },
}));
