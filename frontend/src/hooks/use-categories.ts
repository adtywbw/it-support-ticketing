import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/axios';
import type { Category } from '@/types';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await apiClient.get<Category[]>('/categories');
      return response.data;
    },
  });
}

export function useCategory(id: number) {
  return useQuery({
    queryKey: ['category', id],
    queryFn: async () => {
      const response = await apiClient.get<Category>(`/categories/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}
