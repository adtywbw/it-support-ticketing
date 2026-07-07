import { useQuery } from '@tanstack/react-query';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';
import type { Location } from '@/types';

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    staleTime: 1000 * 60 * 30, // 30 min — reference data
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Location[]>>('/locations');
      return unwrapData(response);
    },
  });
}
