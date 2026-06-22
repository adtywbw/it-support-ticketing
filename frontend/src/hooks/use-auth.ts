import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import apiClient from '@/lib/axios';
import { useAuthStore } from '@/stores/auth-store';
import type { LoginCredentials, AuthResponse } from '@/types';

export function useLogin() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
      return response.data;
    },
    onSuccess: (data) => {
      const user = { ...data.user, name: data.user.name || `${data.user.firstName || ''} ${data.user.lastName || ''}`.trim() };
      login(user, data.accessToken);
      navigate('/tickets');
    },
    onError: (error: unknown) => {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Login failed. Please try again.';
      toast.error(message);
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
