import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useLandingPageContent, useLandingPageAdminContent } from '../use-landing-page';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
  },
  unwrapData: vi.fn((res) => res.data.data),
}));

const mockGet = vi.mocked((await import('@/lib/axios')).default.get);

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useLandingPageContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should GET /landing-page/content', async () => {
    mockGet.mockResolvedValueOnce({
      data: { data: { contact: { email: 'it@company.com', phone: '', hours: '', location: '' }, faqs: [] } },
    });

    const { result } = renderHook(() => useLandingPageContent(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockGet).toHaveBeenCalledWith('/landing-page/content');
    expect(result.current.data?.contact.email).toBe('it@company.com');
  });
});

describe('useLandingPageAdminContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should GET /landing-page/content/admin', async () => {
    mockGet.mockResolvedValueOnce({
      data: { data: { contact: { email: '', phone: '', hours: '', location: '' }, faqs: [{ id: '1', question: 'Q', answer: 'A', order: 0, active: false }] } },
    });

    const { result } = renderHook(() => useLandingPageAdminContent(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockGet).toHaveBeenCalledWith('/landing-page/content/admin');
    expect(result.current.data?.faqs).toHaveLength(1);
  });
});
