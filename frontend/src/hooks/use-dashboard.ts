import { useQuery } from '@tanstack/react-query';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';
import type { DashboardStats } from '@/types';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<{
        statusCounts: Record<string, number>;
        priorityCounts: Record<string, number>;
        slaStats: { total: number; onTrack: number; atRisk: number; breached: number; complianceRate: number };
        dailyTrends: { last7Days: Record<string, number>; last30Days: Record<string, number> };
          categoryResolution: { categoryId: string; categoryName: string; avgResolutionMinutes: number }[];
      }>>('/dashboard/stats');
      const raw = unwrapData(response);
      const stats: DashboardStats = {
        totalTickets: Object.values(raw.statusCounts).reduce((a, b) => a + b, 0),
        ticketsByStatus: Object.entries(raw.statusCounts).map(([status, count]) => ({ status, count })),
        ticketsByPriority: Object.entries(raw.priorityCounts).map(([priority, count]) => ({ priority, count })),
        slaComplianceRate: raw.slaStats.complianceRate / 100,
        avgResolutionTimeByCategory: raw.categoryResolution.map((c) => ({
          category: c.categoryName,
          avgMinutes: c.avgResolutionMinutes,
        })),
        ticketsTrend: Object.entries(raw.dailyTrends.last7Days).map(([date, count]) => ({ date, count })),
      };
      return stats;
    },
  });
}
