import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDashboardStatsPath, useDashboardStats } from '../use-dashboard';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
  },
  unwrapData: vi.fn((response) => response.data.data),
}));

const apiClient = (await import('@/lib/axios')).default;
const mockGet = vi.mocked(apiClient.get);

const createQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const dashboardPayload = {
  current: { activeTickets: 1, open: 1, inProgress: 0, slaRisk: 0, unassigned: 0 },
  attention: { slaRisk: [], highPriority: [], unassigned: [] },
  analytics: {
    range: { preset: '30d', from: '2026-06-03', to: '2026-07-02' },
    trend: [],
    statusCounts: { Open: 1, InProgress: 0, OnHold: 0, Resolved: 0, Closed: 0 },
    priorityCounts: { Low: 0, Medium: 1, High: 0, Critical: 0 },
    slaComplianceRate: 100,
    avgResolutionTimeByCategory: [],
    topCategories: [],
  },
};

describe('use-dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a default 30d dashboard stats path', () => {
    expect(buildDashboardStatsPath()).toBe('/dashboard/stats?range=30d');
  });

  it('builds a custom dashboard stats path with from and to', () => {
    expect(buildDashboardStatsPath({ range: 'custom', from: '2026-06-01', to: '2026-06-30' })).toBe(
      '/dashboard/stats?range=custom&from=2026-06-01&to=2026-06-30',
    );
  });

  it('fetches dashboard stats and unwraps the API envelope', async () => {
    const queryClient = createQueryClient();
    mockGet.mockResolvedValueOnce({ data: { data: dashboardPayload } });

    const result = renderHook(() => useDashboardStats({ range: '30d' }), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(result.result.current.data?.current.open).toBe(1));
    expect(mockGet).toHaveBeenCalledWith('/dashboard/stats?range=30d');
  });
});
