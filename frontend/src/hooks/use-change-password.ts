import { useMutation } from '@tanstack/react-query';
import apiClient from '@/lib/axios';

interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (payload: ChangePasswordPayload) => {
      const response = await apiClient.post('/auth/change-password', payload);
      return response.data;
    },
  });
}
