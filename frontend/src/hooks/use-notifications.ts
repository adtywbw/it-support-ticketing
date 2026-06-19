import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/axios';
import { useNotificationStore } from '@/stores/notification-store';
import type { Notification, PaginatedResponse } from '@/types';
import { useEffect } from 'react';

export function useNotifications(page = 1, limit = 20) {
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);

  const query = useQuery({
    queryKey: ['notifications', page],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<Notification>>(
        `/notifications?page=${page}&limit=${limit}`,
      );
      return response.data;
    },
  });

  useEffect(() => {
    if (query.data) {
      const unread = query.data.data.filter((n) => !n.isRead).length;
      setUnreadCount(unread);
    }
  }, [query.data, setUnreadCount]);

  return query;
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  const decrement = useNotificationStore((s) => s.decrement);

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.patch(`/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      decrement();
    },
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
      reset();
    },
  });
}
