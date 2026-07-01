import { useQuery } from '@tanstack/react-query';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';
import type { Category } from '@/types';
import { STALE_TIME_CATEGORIES } from '@/lib/constants';
import { useAuthStore } from '@/stores/auth-store';

export function useCategories() {
  const role = useAuthStore((s) => s.user?.role ?? 'anonymous');

  return useQuery({
    queryKey: ['categories', role],
    staleTime: STALE_TIME_CATEGORIES,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Category[]>>('/categories');
      return unwrapData(response);
    },
  });
}

export function useCategory(id: string) {
  const role = useAuthStore((s) => s.user?.role ?? 'anonymous');

  return useQuery({
    queryKey: ['category', role, id],
    staleTime: STALE_TIME_CATEGORIES,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Category>>(`/categories/${id}`);
      return unwrapData(response);
    },
    enabled: !!id,
  });
}
