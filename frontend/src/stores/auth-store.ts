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

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  login: (user, accessToken) => {
    set({ user, accessToken, isAuthenticated: true });
  },
  logout: () => {
    set({ user: null, accessToken: null, isAuthenticated: false });
    // Reset notification unread count on logout so a new user
    // doesn't briefly see the previous user's count.
    // Dynamic import avoids circular dependency at module evaluation time.
    import('@/stores/notification-store').then(({ useNotificationStore }) => {
      useNotificationStore.getState().reset();
    }).catch(() => { /* best-effort */ });
  },
  setAccessToken: (accessToken) => {
    set({ accessToken });
  },
  setUser: (user) => {
    set({ user });
  },
}));
