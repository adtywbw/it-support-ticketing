import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useCategories, useCategory } from '../use-categories';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
  },
  unwrapData: vi.fn((res) => res.data.data),
}));

const mockGet = vi.mocked((await import('@/lib/axios')).default.get);

const createQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useCategories role-aware cache keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useAuthStore.getState().logout();
    });
  });

  it('should keep category list caches separate by role', async () => {
    const queryClient = createQueryClient();
    mockGet
      .mockResolvedValueOnce({ data: { data: [{ id: 'cat-1', name: 'Minimal' }] } })
      .mockResolvedValueOnce({ data: { data: [{ id: 'cat-1', name: 'Full', _count: { tickets: 1 } }] } });

    act(() => {
      useAuthStore.getState().login({ id: 'user-1', email: 'user@test.com', name: 'User', role: 'EndUser', isActive: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }, 'token-1');
    });
    const first = renderHook(() => useCategories(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(first.result.current.data?.[0]?.name).toBe('Minimal'));

    act(() => {
      useAuthStore.getState().login({ id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'Admin', isActive: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }, 'token-2');
    });
    const second = renderHook(() => useCategories(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(second.result.current.data?.[0]?.name).toBe('Full'));

    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('should keep category detail caches separate by role', async () => {
    const queryClient = createQueryClient();
    mockGet
      .mockResolvedValueOnce({ data: { data: { id: 'cat-1', name: 'Minimal' } } })
      .mockResolvedValueOnce({ data: { data: { id: 'cat-1', name: 'Full', _count: { tickets: 1 } } } });

    act(() => {
      useAuthStore.getState().login({ id: 'user-1', email: 'user@test.com', name: 'User', role: 'EndUser', isActive: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }, 'token-1');
    });
    const first = renderHook(() => useCategory('cat-1'), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(first.result.current.data?.name).toBe('Minimal'));

    act(() => {
      useAuthStore.getState().login({ id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'Admin', isActive: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }, 'token-2');
    });
    const second = renderHook(() => useCategory('cat-1'), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(second.result.current.data?.name).toBe('Full'));

    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
