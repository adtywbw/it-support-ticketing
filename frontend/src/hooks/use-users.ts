import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient, { unwrapData, unwrapPage, type ApiEnvelope } from '@/lib/axios';
import type { User, CreateUserPayload, UpdateUserPayload } from '@/types';
import { STALE_TIME_ASSIGNABLE_USERS } from '@/lib/constants';
import { getErrorMessage } from '@/lib/utils';

export function useUsers(options?: { enabled?: boolean; page?: number; limit?: number; includeInactive?: boolean }) {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 10;
  const includeInactive = options?.includeInactive ?? true;
  return useQuery({
    queryKey: ['users', page, limit, includeInactive],
    staleTime: STALE_TIME_ASSIGNABLE_USERS,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<User[]>>(`/users?includeInactive=${includeInactive}&page=${page}&limit=${limit}`);
      return unwrapPage(response);
    },
    enabled: options?.enabled ?? true,
  });
}

export function useAssignableUsers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['users', 'assignable'],
    staleTime: STALE_TIME_ASSIGNABLE_USERS,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Array<{ id: string; name: string; email: string; role: string }>>>('/users/assignable');
      return unwrapData(response);
    },
    enabled: options?.enabled ?? true,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateUserPayload) => {
      const response = await apiClient.post<ApiEnvelope<User>>('/users', payload);
      return unwrapData(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to create user')),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateUserPayload }) => {
      const response = await apiClient.patch<ApiEnvelope<User>>(`/users/${id}`, payload);
      return unwrapData(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to update user')),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete<ApiEnvelope<void>>(`/users/${id}`);
      return unwrapData(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to delete user')),
  });
}
