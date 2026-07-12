import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';
import { getErrorMessage } from '@/lib/utils';
import { STALE_TIME_FAQS } from '@/lib/constants';
import type {
  Faq,
  PublicFaq,
  FaqRecommendation,
  FaqInteractionPayload,
  FaqAnalytics,
} from '@/types';

export interface CreateFaqPayload {
  question: string;
  answer: string;
  displayOrder?: number;
  isActive?: boolean;
  categoryId?: string | null;
  keywords?: string[];
}
export type UpdateFaqPayload = Partial<CreateFaqPayload>;

export function useFaqs() {
  return useQuery({
    queryKey: ['faqs', 'public'],
    staleTime: STALE_TIME_FAQS,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<PublicFaq[]>>('/faqs');
      return unwrapData(response);
    },
  });
}

export function useAllFaqs() {
  return useQuery({
    queryKey: ['faqs', 'admin'],
    staleTime: STALE_TIME_FAQS,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Faq[]>>('/faqs/all');
      return unwrapData(response);
    },
  });
}

export function useCreateFaq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateFaqPayload) => {
      const response = await apiClient.post<ApiEnvelope<Faq>>('/faqs', payload);
      return unwrapData(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faqs'] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, 'Failed to create FAQ'));
    },
  });
}

export function useUpdateFaq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateFaqPayload }) => {
      const response = await apiClient.patch<ApiEnvelope<Faq>>(`/faqs/${id}`, payload);
      return unwrapData(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faqs'] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, 'Failed to update FAQ'));
    },
  });
}

export function useDeleteFaq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/faqs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faqs'] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, 'Failed to delete FAQ'));
    },
  });
}

export function useFaqRecommendations(params: { categoryId?: string; query?: string }) {
  const enabled = Boolean(params.categoryId || (params.query?.trim().length ?? 0) >= 3);
  return useQuery({
    queryKey: ['faqs', 'recommendations', params.categoryId ?? '', params.query ?? ''],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await apiClient.get<ApiEnvelope<FaqRecommendation[]>>(
        '/faqs/recommendations',
        { params, signal },
      );
      return response.data.data;
    },
  });
}

export function useRecordFaqInteraction() {
  return useMutation({
    mutationFn: async (payload: FaqInteractionPayload) => {
      const response = await apiClient.post<ApiEnvelope<{ recorded: true }>>(
        '/faqs/interactions',
        payload,
      );
      return response.data.data;
    },
  });
}

export function useFaqAnalytics() {
  return useQuery({
    queryKey: ['faqs', 'analytics', '30d'],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<FaqAnalytics>>('/faqs/analytics', {
        params: { range: '30d' },
      });
      return response.data.data;
    },
  });
}
