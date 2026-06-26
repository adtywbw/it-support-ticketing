import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';

export interface TelegramSettings {
  enabledEvents: string[];
  enableGroupChat: boolean;
  groupChatId?: string;
  notifyIndividualsWhenGroupChat: boolean;
  templates: Record<string, string>;
}

export interface TelegramConfig {
  botToken: string;
  hasBotToken: boolean;
  hasGroupChatId: boolean;
  settings: TelegramSettings;
}

export function useTelegramStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['telegram-status'],
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
  });
}

export function useTelegramConfig(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['telegram-config'],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<TelegramConfig>>('/telegram/config');
      return unwrapData(res);
    },
    enabled: options?.enabled ?? true,
  });
}

export interface CheckResult {
  bot: { valid: boolean; username?: string; firstName?: string; error?: string };
  groupChat: { valid: boolean; title?: string; type?: string; error?: string } | null;
}

export function useCheckTelegram() {
  return useMutation({
    mutationFn: async (data: { botToken?: string; groupChatId?: string }) => {
      const res = await apiClient.post<ApiEnvelope<CheckResult>>('/telegram/check', data);
      return unwrapData(res);
    },
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
  });
}
