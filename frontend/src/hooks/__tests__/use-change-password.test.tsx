import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useChangePassword } from '../use-change-password';

vi.mock('@/lib/axios', () => ({
  default: {
    post: vi.fn(),
  },
  unwrapData: vi.fn((res) => res.data.data),
}));

const mockPost = vi.mocked((await import('@/lib/axios')).default.post);

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('FE-04: useChangePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should POST to /auth/change-password with payload', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: null } });

    const { result } = renderHook(() => useChangePassword(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        currentPassword: 'oldPass123!',
        newPassword: 'newPass456!',
      });
    });

    expect(mockPost).toHaveBeenCalledWith('/auth/change-password', {
      currentPassword: 'oldPass123!',
      newPassword: 'newPass456!',
    });
  });

  it('should surface server errors to the caller', async () => {
    const axiosError = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: { data: { error: { code: 'BAD_REQUEST', message: 'Current password is incorrect' } } },
    });
    mockPost.mockRejectedValueOnce(axiosError);

    const { result } = renderHook(() => useChangePassword(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ currentPassword: 'wrong', newPassword: 'newPass1!' }),
    ).rejects.toThrow('Request failed');
  });

  it('should set isError state when the mutation fails', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useChangePassword(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ currentPassword: 'a', newPassword: 'b' });
      } catch {
        // expected
      }
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
