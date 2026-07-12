import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';

vi.mock('@/lib/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  unwrapData: vi.fn((res) => res.data.data),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn() },
}));

const apiClient = (await import('@/lib/axios')).default;
const toast = (await import('react-hot-toast')).default;

const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('use-faqs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests recommendations with params and query cancellation signal', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    const queryClient = createQueryClient();

    const { useFaqRecommendations } = await import('../use-faqs');

    renderHook(() => useFaqRecommendations({ categoryId: 'cat-1', query: 'wifi' }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(apiClient.get).toHaveBeenCalledWith('/faqs/recommendations', {
      params: { categoryId: 'cat-1', query: 'wifi' },
      signal: expect.any(AbortSignal),
    });
  });

  it('does not add a hook-level interaction error toast', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('offline'));
    const queryClient = createQueryClient();

    const { useRecordFaqInteraction } = await import('../use-faqs');

    const { result } = renderHook(() => useRecordFaqInteraction(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({
        sessionId: 'sess-1',
        eventType: 'ArticleOpened',
      }),
    ).rejects.toThrow('offline');
    expect(toast.error).not.toHaveBeenCalled();
  });
});
