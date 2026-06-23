import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/axios';

export interface TelegramSettings {
  enabledEvents: string[];
  enableGroupChat: boolean;
  groupChatId?: string;
  templates: Record<string, string>;
}

export interface TelegramConfig {
  botToken: string;
  hasBotToken: boolean;
  hasGroupChatId: boolean;
  settings: TelegramSettings;
}

export function useTelegramStatus() {
  return useQuery({
    queryKey: ['telegram-status'],
    queryFn: async () => {
      const res = await apiClient.get<{ linked: boolean }>('/telegram/status');
      return res.data;
    },
  });
}

export function useGenerateTelegramCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ code: string; expiresIn: number }>(
        '/telegram/link',
      );
      return res.data;
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

export function useTelegramConfig() {
  return useQuery({
    queryKey: ['telegram-config'],
    queryFn: async () => {
      const res = await apiClient.get<TelegramConfig>('/telegram/config');
      return res.data;
    },
  });
}

export function useUpdateTelegramConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      botToken?: string;
      settings?: TelegramSettings;
    }) => {
      const res = await apiClient.put<TelegramConfig>('/telegram/config', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-config'] });
    },
  });
}
