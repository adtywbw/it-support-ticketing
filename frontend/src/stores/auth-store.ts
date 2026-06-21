import { create } from 'zustand';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (user: User, accessToken: string) => void;
  logout: () => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: User) => void;
}

let _accessToken: string | null = null;

export const getAccessToken = () => _accessToken;

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  login: (user, accessToken) => {
    _accessToken = accessToken;
    set({ user, accessToken, isAuthenticated: true });
  },
  logout: () => {
    _accessToken = null;
    set({ user: null, accessToken: null, isAuthenticated: false });
  },
  setAccessToken: (accessToken) => {
    _accessToken = accessToken;
    set({ accessToken });
  },
  setUser: (user) => {
    set({ user });
  },
}));
