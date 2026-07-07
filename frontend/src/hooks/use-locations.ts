import { useQuery } from '@tanstack/react-query';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';
import type { Location } from '@/types';
import { STALE_TIME_LOCATIONS } from '@/lib/constants';

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    staleTime: STALE_TIME_LOCATIONS,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Location[]>>('/locations');
      return unwrapData(response);
    },
  });
}
