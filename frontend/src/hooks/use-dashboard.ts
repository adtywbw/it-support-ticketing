import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/axios';
import type { DashboardStats } from '@/types';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const response = await apiClient.get<DashboardStats>('/dashboard/stats');
      return response.data;
    },
  });
}
