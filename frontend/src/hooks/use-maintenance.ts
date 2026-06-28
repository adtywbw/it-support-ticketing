import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient, { unwrapData, unwrapBlob, type ApiEnvelope } from '@/lib/axios';
import type { BackupInfo, MaintenanceStatus } from '@/types';

export function useMaintenanceMode() {
  return useQuery({
    queryKey: ['maintenance', 'mode'],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<MaintenanceStatus>>('/maintenance/mode');
      return unwrapData(response);
    },
    refetchInterval: 5000,
  });
}

export function useSetMaintenanceMode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ enabled, message }: { enabled: boolean; message?: string }) => {
      const response = await apiClient.patch<ApiEnvelope<MaintenanceStatus>>('/maintenance/mode', {
        enabled,
        message,
      });
      return unwrapData(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance', 'mode'] });
    },
  });
}

export function useBackups() {
  return useQuery({
    queryKey: ['maintenance', 'backups'],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<BackupInfo[]>>('/maintenance/backups');
      return unwrapData(response);
    },
  });
}

export function useCreateBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<ApiEnvelope<BackupInfo>>('/maintenance/backups');
      return unwrapData(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance', 'backups'] });
    },
  });
}

export function useDeleteBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/maintenance/backups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance', 'backups'] });
    },
  });
}

export function useRestoreBackup() {
  return useMutation({
    mutationFn: async ({ id, confirmation }: { id: string; confirmation: string }) => {
      const response = await apiClient.post<ApiEnvelope<{ message: string; preRestoreBackup: BackupInfo }>>(
        `/maintenance/backups/${id}/restore`,
        { confirmation },
      );
      return unwrapData(response);
    },
  });
}

export async function downloadBackupFile(id: string, type: 'db' | 'uploads') {
  const response = await apiClient.get<Blob>(`/maintenance/backups/${id}/download/${type}`, {
    responseType: 'blob',
  });
  const blob = unwrapBlob(response);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${id}-${type === 'db' ? 'db.sql.gz' : 'uploads.tar.gz'}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
