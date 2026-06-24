import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/axios';
import type { BackupInfo } from '@/types';

export function useBackups() {
  return useQuery({
    queryKey: ['maintenance', 'backups'],
    queryFn: async () => {
      const response = await apiClient.get<BackupInfo[]>('/maintenance/backups');
      return response.data;
    },
  });
}

export function useCreateBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<BackupInfo>('/maintenance/backups');
      return response.data;
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
      const response = await apiClient.post<{ message: string; preRestoreBackup: BackupInfo }>(
        `/maintenance/backups/${id}/restore`,
        { confirmation },
      );
      return response.data;
    },
  });
}

export async function downloadBackupFile(id: string, type: 'db' | 'uploads') {
  const response = await apiClient.get(`/maintenance/backups/${id}/download/${type}`, {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${id}-${type === 'db' ? 'db.sql.gz' : 'uploads.tar.gz'}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
