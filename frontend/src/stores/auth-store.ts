import { create } from 'zustand';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  login: (user, accessToken, refreshToken) => {
    set({ user, accessToken, refreshToken, isAuthenticated: true });
  },
  logout: () => {
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
  },
  setTokens: (accessToken, refreshToken) => {
    set({ accessToken, refreshToken });
  },
  setUser: (user) => {
    set({ user });
  },
}));

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__authStore = useAuthStore;
}
