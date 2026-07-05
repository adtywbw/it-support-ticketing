import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useUnreadNotificationCount, useNotifications, useMarkAllAsRead, useClearAll } from '../use-notifications';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  unwrapData: vi.fn((res) => res.data.data),
  unwrapPage: vi.fn((res) => ({ data: res.data.data, meta: res.data.meta })),
}));

const apiClient = vi.mocked((await import('@/lib/axios')).default);
const mockGet = apiClient.get;

const createQueryHarness = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
};

describe('FE-03: useUnreadNotificationCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch unread count from server', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: { count: 5 } } });

    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper: createQueryHarness().wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({ count: 5 });
    });

    expect(mockGet).toHaveBeenCalledWith('/notifications/unread-count');
  });
});

describe('FE-03: useNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch notifications list', async () => {
    const mockNotifications = [
      { id: '1', title: 'Test', message: 'msg', isRead: false, createdAt: '' },
    ];
    mockGet.mockResolvedValueOnce({
      data: { data: mockNotifications, meta: { total: 1, page: 1, limit: 10 } },
    });

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createQueryHarness().wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({
        data: mockNotifications,
        meta: { total: 1, page: 1, limit: 10 },
      });
    });

    expect(mockGet).toHaveBeenCalledWith('/notifications?page=1&limit=20');
  });
});

describe('FE-03: notification bulk mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates unread count after mark all as read', async () => {
    apiClient.patch.mockResolvedValueOnce({ data: { data: {} } });
    const { queryClient, wrapper } = createQueryHarness();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMarkAllAsRead(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications-unread-count'] });
  });

  it('invalidates unread count after clear all', async () => {
    apiClient.delete.mockResolvedValueOnce({ data: { data: {} } });
    const { queryClient, wrapper } = createQueryHarness();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useClearAll(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications-unread-count'] });
  });
});
