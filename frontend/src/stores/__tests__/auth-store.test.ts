import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../auth-store';

describe('Auth Store', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false });
  });

  it('should start unauthenticated', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
  });

  it('should set user and token on login', () => {
    const user = { id: '1', email: 'test@test.com', name: 'Test', role: 'Admin' as const, isActive: true, createdAt: '', updatedAt: '' };
    const token = 'access-token-123';

    useAuthStore.getState().login(user, token);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(user);
    expect(state.accessToken).toBe(token);
  });

  it('should clear state on logout', () => {
    const user = { id: '1', email: 'test@test.com', name: 'Test', role: 'Admin' as const, isActive: true, createdAt: '', updatedAt: '' };
    useAuthStore.getState().login(user, 'token');
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
  });
});
