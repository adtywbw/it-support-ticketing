import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '../use-notification-preferences';

vi.mock('@/lib/axios', () => ({
  default: { get: vi.fn(), patch: vi.fn() },
  unwrapData: vi.fn((res) => res.data.data),
}));

const apiClient = (await import('@/lib/axios')).default;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useNotificationPreferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches preferences from /notifications/preferences', async () => {
    const payload = {
      preferences: { 'ticket.created': true },
      availableEvents: [
        { event: 'ticket.created', label: 'New Ticket Created' },
      ],
    };
    (apiClient.get as any).mockResolvedValueOnce({ data: { data: payload } });

    const { result } = renderHook(() => useNotificationPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual(payload));
    expect(apiClient.get).toHaveBeenCalledWith('/notifications/preferences');
  });
});

describe('useUpdateNotificationPreferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('PATCHes preferences and returns the response', async () => {
    const updated = {
      preferences: { 'ticket.created': false },
      availableEvents: [],
    };
    (apiClient.patch as any).mockResolvedValueOnce({ data: { data: updated } });

    const { result } = renderHook(() => useUpdateNotificationPreferences(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ 'ticket.created': false });

    expect(apiClient.patch).toHaveBeenCalledWith('/notifications/preferences', {
      preferences: { 'ticket.created': false },
    });
  });
});
