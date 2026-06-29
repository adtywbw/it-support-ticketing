import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useUnreadNotificationCount, useNotifications } from '../use-notifications';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
  },
  unwrapData: vi.fn((res) => res.data.data),
  unwrapPage: vi.fn((res) => ({ data: res.data.data, meta: res.data.meta })),
}));

const mockGet = vi.mocked((await import('@/lib/axios')).default.get);

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('FE-03: useUnreadNotificationCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch unread count from server', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: { count: 5 } } });

    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper: createWrapper(),
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
      wrapper: createWrapper(),
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
