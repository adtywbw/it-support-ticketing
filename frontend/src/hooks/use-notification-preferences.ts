import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';
import type {
  NotificationPreferencesMap,
  NotificationPreferencesResponse,
} from '@/types';
import { STALE_TIME_NOTIFICATION_PREFERENCES } from '@/lib/constants';
import { getErrorMessage } from '@/lib/utils';

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const response = await apiClient.get<
        ApiEnvelope<NotificationPreferencesResponse>
      >('/notifications/preferences');
      return unwrapData(response);
    },
    staleTime: STALE_TIME_NOTIFICATION_PREFERENCES,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (preferences: NotificationPreferencesMap) => {
      const response = await apiClient.patch<
        ApiEnvelope<NotificationPreferencesResponse>
      >('/notifications/preferences', { preferences });
      return unwrapData(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['notification-preferences'],
      });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to update notification preferences')),
  });
}
