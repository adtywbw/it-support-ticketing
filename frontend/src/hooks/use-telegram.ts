import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';
import { STALE_TIME_TELEGRAM_CONFIG } from '@/lib/constants';
import type { TelegramSettings, TelegramConfig, TelegramCheckResult } from '@/types';
import { getErrorMessage } from '@/lib/utils';

export function useTelegramStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['telegram-status'],
    staleTime: STALE_TIME_TELEGRAM_CONFIG,
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<{ linked: boolean }>>('/telegram/status');
      return unwrapData(res);
    },
    enabled: options?.enabled ?? true,
  });
}

export function useGenerateTelegramCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ApiEnvelope<{ code: string; expiresIn: number }>>(
        '/telegram/link',
      );
      return unwrapData(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-status'] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to generate Telegram code')),
  });
}

export function useUnlinkTelegram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await apiClient.delete('/telegram/link');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-status'] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to unlink Telegram')),
  });
}

export function useTelegramConfig(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['telegram-config'],
    staleTime: STALE_TIME_TELEGRAM_CONFIG,
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<TelegramConfig>>('/telegram/config');
      return unwrapData(res);
    },
    enabled: options?.enabled ?? true,
  });
}

export function useCheckTelegram() {
  return useMutation({
    mutationFn: async (data: { botToken?: string; groupChatId?: string }) => {
      const res = await apiClient.post<ApiEnvelope<TelegramCheckResult>>('/telegram/check', data);
      return unwrapData(res);
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Telegram configuration check failed')),
  });
}

export function useSendTestNotification() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ApiEnvelope<{ message: string }>>(
        '/telegram/test-notification',
      );
      return unwrapData(res);
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to send test notification')),
  });
}

export function useUpdateTelegramConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      botToken?: string | null;
      settings?: TelegramSettings;
    }) => {
      const res = await apiClient.put<ApiEnvelope<TelegramConfig>>('/telegram/config', data);
      return unwrapData(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-config'] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to update Telegram configuration')),
  });
}
