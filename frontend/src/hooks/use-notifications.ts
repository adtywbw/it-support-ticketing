import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient, { unwrapData, unwrapPage, type ApiEnvelope } from '@/lib/axios';
import { useNotificationStore } from '@/stores/notification-store';
import type { Notification } from '@/types';
import { UNREAD_NOTIFICATIONS_POLL_MS, STALE_TIME_NOTIFICATION_DROPDOWN } from '@/lib/constants';
import { getErrorMessage } from '@/lib/utils';

export function useUnreadNotificationCount() {
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);

  const query = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<{ count: number }>>('/notifications/unread-count');
      return unwrapData(response);
    },
    refetchInterval: UNREAD_NOTIFICATIONS_POLL_MS,
  });

  useEffect(() => {
    if (query.data) {
      setUnreadCount(query.data.count);
    }
  }, [query.data, setUnreadCount]);

  return query;
}

export function useNotifications(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['notifications', page, limit],
    staleTime: STALE_TIME_NOTIFICATION_DROPDOWN,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Notification[]>>(
        `/notifications?page=${page}&limit=${limit}`,
      );
      return unwrapPage(response);
    },
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  const decrement = useNotificationStore((s) => s.decrement);

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.patch(`/notifications/${id}/read`);
    },
    onSuccess: () => {
      decrement();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to mark notification as read')),
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();
  const reset = useNotificationStore((s) => s.reset);

  return useMutation({
    mutationFn: async () => {
      await apiClient.patch('/notifications/read-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      reset();
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to mark all as read')),
  });
}

export function useClearAll() {
  const queryClient = useQueryClient();
  const reset = useNotificationStore((s) => s.reset);

  return useMutation({
    mutationFn: async () => {
      await apiClient.delete('/notifications');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      reset();
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to clear notifications')),
  });
}
