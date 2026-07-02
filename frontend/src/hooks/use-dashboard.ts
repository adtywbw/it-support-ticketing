import { useQuery } from '@tanstack/react-query';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';
import { STALE_TIME_DASHBOARD } from '@/lib/constants';
import type { DashboardStats, DashboardStatsQuery } from '@/types';

export const DEFAULT_DASHBOARD_QUERY: DashboardStatsQuery = { range: '30d' };

export function buildDashboardStatsPath(query: DashboardStatsQuery = DEFAULT_DASHBOARD_QUERY) {
  const params = new URLSearchParams();
  params.set('range', query.range);
  if (query.range === 'custom') {
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
  }
  const qs = params.toString();
  return `/dashboard/stats${qs ? `?${qs}` : ''}`;
}

export function useDashboardStats(query: DashboardStatsQuery = DEFAULT_DASHBOARD_QUERY) {
  return useQuery({
    queryKey: ['dashboard', 'stats', query],
    staleTime: STALE_TIME_DASHBOARD,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<DashboardStats>>(buildDashboardStatsPath(query));
      return unwrapData(response);
    },
  });
}
