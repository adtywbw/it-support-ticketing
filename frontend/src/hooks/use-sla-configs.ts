import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';
import { STALE_TIME_SLA_CONFIGS } from '@/lib/constants';
import type { CreateSLAConfigPayload, SLAConfig, UpdateSLAConfigPayload } from '@/types';
import { getErrorMessage } from '@/lib/utils';

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
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to create SLA config')),
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
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to update SLA config')),
  });
}
