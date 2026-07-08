import { useQuery } from '@tanstack/react-query';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';

interface ActiveUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function useAllUsers() {
  return useQuery({
    queryKey: ['users', 'active'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<ActiveUser[]>>('/users/active');
      return unwrapData(response);
    },
  });
}
