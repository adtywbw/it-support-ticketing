import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useCreateSLAConfig, useSLAConfigs, useUpdateSLAConfig } from '../use-sla-configs';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  unwrapData: vi.fn((res) => res.data.data),
}));

const apiClient = (await import('@/lib/axios')).default;
const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);
const mockPatch = vi.mocked(apiClient.patch);

const createQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('use-sla-configs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch SLA configs and unwrap the API envelope', async () => {
    const queryClient = createQueryClient();
    mockGet.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'sla-1',
            categoryId: 'cat-1',
            priority: 'High',
            responseTimeMinutes: 60,
            resolutionTimeMinutes: 240,
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            category: { id: 'cat-1', name: 'Network' },
          },
        ],
      },
    });

    const result = renderHook(() => useSLAConfigs(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(result.result.current.data?.[0]?.category?.name).toBe('Network'));
    expect(mockGet).toHaveBeenCalledWith('/sla-configs');
  });

  it('should create an SLA config and invalidate SLA config queries', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    mockPost.mockResolvedValueOnce({ data: { data: { id: 'sla-1' } } });

    const result = renderHook(() => useCreateSLAConfig(), { wrapper: createWrapper(queryClient) });

    result.result.current.mutate({
      categoryId: 'cat-1',
      priority: 'High',
      responseTimeMinutes: 60,
      resolutionTimeMinutes: 240,
    });

    await waitFor(() => expect(result.result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/sla-configs', {
      categoryId: 'cat-1',
      priority: 'High',
      responseTimeMinutes: 60,
      resolutionTimeMinutes: 240,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sla-configs'] });
  });

  it('should update an SLA config and invalidate SLA config queries', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    mockPatch.mockResolvedValueOnce({ data: { data: { id: 'sla-1', isActive: false } } });

    const result = renderHook(() => useUpdateSLAConfig(), { wrapper: createWrapper(queryClient) });

    result.result.current.mutate({ id: 'sla-1', payload: { isActive: false } });

    await waitFor(() => expect(result.result.current.isSuccess).toBe(true));
    expect(mockPatch).toHaveBeenCalledWith('/sla-configs/sla-1', { isActive: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sla-configs'] });
  });
});
