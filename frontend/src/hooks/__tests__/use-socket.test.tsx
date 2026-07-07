import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useSocket } from '../use-socket';
import { useAuthStore } from '@/stores/auth-store';
import type { User } from '@/types';

const testUser: User = {
  id: 'u1',
  email: 'a@b.com',
  name: 'A',
  role: 'EndUser',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Mock socket.io-client with a controllable mock socket
const mockSocketListeners: Record<string, Array<(...args: unknown[]) => void>> = {};
const mockSocket = {
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (!mockSocketListeners[event]) mockSocketListeners[event] = [];
    mockSocketListeners[event].push(handler);
    return mockSocket;
  }),
  disconnect: vi.fn(),
  emit: vi.fn(),
  removeAllListeners: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

const mockIo = vi.mocked((await import('socket.io-client')).io);

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const triggerSocketEvent = (event: string, ...args: unknown[]) => {
  const handlers = mockSocketListeners[event] || [];
  for (const h of handlers) h(...args);
};

describe('FE-04: useSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockSocketListeners).forEach((k) => delete mockSocketListeners[k]);
    // Reset auth store to unauthenticated
    useAuthStore.setState({
      accessToken: null,
      isAuthenticated: false,
      user: null,
    });
  });

  afterEach(() => {
    // Cleanup any open socket
    act(() => {
      useAuthStore.setState({ accessToken: null, isAuthenticated: false });
    });
  });

  it('should not connect when not authenticated', () => {
    renderHook(() => useSocket(), { wrapper: createWrapper() });

    expect(mockIo).not.toHaveBeenCalled();
  });

  it('should connect with auth token when authenticated', () => {
    act(() => {
      useAuthStore.setState({
        accessToken: 'test-token',
        isAuthenticated: true,
        user: testUser,
      });
    });

    renderHook(() => useSocket(), { wrapper: createWrapper() });

    expect(mockIo).toHaveBeenCalledWith(
      '/notifications',
      expect.objectContaining({
        auth: { token: 'test-token' },
        transports: ['websocket', 'polling'],
        reconnection: true,
      }),
    );
  });

  it('should NOT disconnect on auth-error from server', () => {
    act(() => {
      useAuthStore.setState({
        accessToken: 'test-token',
        isAuthenticated: true,
        user: testUser,
      });
    });

    renderHook(() => useSocket(), { wrapper: createWrapper() });

    // Simulate auth-related connect_error
    act(() => {
      triggerSocketEvent('connect_error', new Error('unauthorized'));
    });

    // New behavior: do NOT disconnect on auth error — reconnect_attempt will refresh token
    expect(mockSocket.disconnect).not.toHaveBeenCalled();
  });

  it('registers reconnect_attempt handler for auth token refresh', () => {
    act(() => {
      useAuthStore.setState({
        accessToken: 'test-token',
        isAuthenticated: true,
        user: testUser,
      });
    });

    renderHook(() => useSocket(), { wrapper: createWrapper() });

    expect(mockSocket.on).toHaveBeenCalledWith('reconnect_attempt', expect.any(Function));
  });

  it('should NOT disconnect on non-auth connect_error', () => {
    act(() => {
      useAuthStore.setState({
        accessToken: 'test-token',
        isAuthenticated: true,
        user: testUser,
      });
    });

    renderHook(() => useSocket(), { wrapper: createWrapper() });

    mockSocket.disconnect.mockClear();

    act(() => {
      triggerSocketEvent('connect_error', new Error('network timeout'));
    });

    expect(mockSocket.disconnect).not.toHaveBeenCalled();
  });

  it('should disconnect on unmount', () => {
    act(() => {
      useAuthStore.setState({
        accessToken: 'test-token',
        isAuthenticated: true,
        user: testUser,
      });
    });

    const { unmount } = renderHook(() => useSocket(), { wrapper: createWrapper() });

    expect(mockSocket.disconnect).not.toHaveBeenCalled();

    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
});
