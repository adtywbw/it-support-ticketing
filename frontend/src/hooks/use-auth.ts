import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';
import { getErrorMessage } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import type { LoginCredentials, AuthResponse } from '@/types';

export function useLogin() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const response = await apiClient.post<ApiEnvelope<AuthResponse>>('/auth/login', credentials);
      return unwrapData(response);
    },
    onSuccess: (data) => {
      const user = { ...data.user, name: data.user.name || `${data.user.firstName || ''} ${data.user.lastName || ''}`.trim() };
      login(user, data.accessToken);
      navigate('/tickets');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Login failed. Please try again.'));
    },
  });
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async () => {
      await apiClient.post('/auth/logout');
    },
    onSettled: () => {
      logout();
      queryClient.clear();
      navigate('/login');
    },
  });
}
