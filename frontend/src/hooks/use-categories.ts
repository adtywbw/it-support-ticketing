import { useQuery } from '@tanstack/react-query';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';
import type { Category } from '@/types';
import { STALE_TIME_CATEGORIES } from '@/lib/constants';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    staleTime: STALE_TIME_CATEGORIES,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Category[]>>('/categories');
      return unwrapData(response);
    },
  });
}

export function useCategory(id: string) {
  return useQuery({
    queryKey: ['category', id],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Category>>(`/categories/${id}`);
      return unwrapData(response);
    },
    enabled: !!id,
  });
}
