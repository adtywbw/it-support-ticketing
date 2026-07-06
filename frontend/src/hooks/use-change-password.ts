import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';
import { getErrorMessage } from '@/lib/utils';

interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (payload: ChangePasswordPayload) => {
      const response = await apiClient.post<ApiEnvelope<void>>('/auth/change-password', payload);
      return unwrapData(response);
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, 'Failed to change password'));
    },
  });
}
