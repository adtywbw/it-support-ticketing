import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';
import { STALE_TIME_SLA_CONFIGS } from '@/lib/constants';
import type { CreateSLAConfigPayload, SLAConfig, UpdateSLAConfigPayload } from '@/types';

export function useSLAConfigs() {
  return useQuery({
    queryKey: ['sla-configs'],
    staleTime: STALE_TIME_SLA_CONFIGS,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<SLAConfig[]>>('/sla-configs');
      return unwrapData(response);
    },
  });
}

export function useCreateSLAConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateSLAConfigPayload) => {
      const response = await apiClient.post<ApiEnvelope<SLAConfig>>('/sla-configs', payload);
      return unwrapData(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-configs'] });
    },
  });
}

export function useUpdateSLAConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateSLAConfigPayload }) => {
      const response = await apiClient.patch<ApiEnvelope<SLAConfig>>(`/sla-configs/${id}`, payload);
      return unwrapData(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-configs'] });
    },
  });
}
