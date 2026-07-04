import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { useUpdateLandingPageContent } from '../use-update-landing-page';

vi.mock('@/lib/axios', () => ({
  default: {
    put: vi.fn(),
  },
  unwrapData: vi.fn((res) => res.data.data),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const mockPut = vi.mocked((await import('@/lib/axios')).default.put);
const mockToast = vi.mocked(toast);

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useUpdateLandingPageContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should PUT /landing-page/content with payload', async () => {
    mockPut.mockResolvedValueOnce({ data: { data: { contact: {}, faqs: [] } } });

    const { result } = renderHook(() => useUpdateLandingPageContent(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ contact: { email: 'new@company.com' } });
    });

    expect(mockPut).toHaveBeenCalledWith('/landing-page/content', { contact: { email: 'new@company.com' } });
  });

  it('should call toast.error on failure', async () => {
    mockPut.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useUpdateLandingPageContent(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ contact: { email: 'x' } });
      } catch {
        // expected
      }
    });

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to save landing page content');
    });
  });
});
