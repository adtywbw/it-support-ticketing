import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useBackups, useCreateBackup, useDeleteBackup, useRestoreBackup, downloadBackupFile } from '@/hooks/use-maintenance';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import { getErrorMessage } from '@/lib/utils';
import apiClient from '@/lib/axios';
import { useAuthStore } from '@/stores/auth-store';
import type { BackupInfo } from '@/types';

function formatBytes(bytes: number) {
  if (bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

interface BackupManagerProps {
  maintenanceEnabled: boolean;
}

export default function BackupManager({ maintenanceEnabled }: BackupManagerProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const { data: backups, isLoading, isError, error, refetch } = useBackups();
  const createBackupMutation = useCreateBackup();
  const deleteBackupMutation = useDeleteBackup();
  const restoreBackupMutation = useRestoreBackup();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [backupToDelete, setBackupToDelete] = useState<BackupInfo | null>(null);
  const [backupToRestore, setBackupToRestore] = useState<BackupInfo | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState('');
  const isActionPending = createBackupMutation.isPending || deleteBackupMutation.isPending || restoreBackupMutation.isPending;

  const handleCreateBackup = async () => {
    try {
      await createBackupMutation.mutateAsync();
      toast.success('Backup created successfully');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create backup'));
    }
  };

  const handleDownload = async (backup: BackupInfo, type: 'db' | 'uploads') => {
    const file = backup.files[type];
    if (!file.exists) return;
    const key = `${backup.id}-${type}`;
    setDownloading(key);
    try {
      await downloadBackupFile(backup.id, type);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to download backup'));
    } finally {
      setDownloading(null);
    }
  };

  const openRestoreDialog = (backup: BackupInfo) => {
    setBackupToRestore(backup);
    setRestoreConfirmation('');
  };

  const closeRestoreDialog = () => {
    setBackupToRestore(null);
    setRestoreConfirmation('');
  };

  const handleDelete = async () => {
    if (!backupToDelete) return;

    try {
      await deleteBackupMutation.mutateAsync(backupToDelete.id);
      setBackupToDelete(null);
      toast.success('Backup deleted successfully');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete backup'));
    }
  };

  const handleRestore = async () => {
    if (!backupToRestore) return;

    try {
      await restoreBackupMutation.mutateAsync({
        id: backupToRestore.id,
        confirmation: restoreConfirmation,
      });
      toast.success('Backup restored successfully. Please log in again.');
      await apiClient.post('/auth/logout').catch(() => {});
      queryClient.clear();
      logout();
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to restore backup'));
    }
  };

  return (
    <>
      <section className="card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-navy-950 dark:text-blue-50">Create Backup</h2>
            <p className="mt-1 text-sm text-navy-500 dark:text-blue-300">
              Generates a compressed PostgreSQL dump and uploads archive under the server `backups/` directory.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={isActionPending || !maintenanceEnabled}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createBackupMutation.isPending ? 'Creating backup...' : 'Create Backup'}
          </button>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-blue-100 p-6 dark:border-navy-800">
          <h2 className="text-lg font-semibold text-navy-950 dark:text-blue-50">Available Backups</h2>
        </div>

        {isLoading ? (
          <div className="p-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : isError ? (
          <div className="p-6">
            <ErrorMessage message={getErrorMessage(error, 'Failed to load backups')} onRetry={() => refetch()} />
          </div>
        ) : !backups || backups.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No backups found" description="Create a backup to make it available for download." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-blue-100 dark:divide-navy-800">
              <thead className="bg-blue-50 dark:bg-navy-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-navy-500 dark:text-blue-300">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-navy-500 dark:text-blue-300">Backup ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-navy-500 dark:text-blue-300">Database</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-navy-500 dark:text-blue-300">Uploads</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-navy-500 dark:text-blue-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100 bg-white dark:divide-navy-800 dark:bg-navy-900">
                {backups.map((backup) => (
                  <tr key={backup.id} className="hover:bg-blue-50 dark:hover:bg-navy-800/60">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-navy-950 dark:text-blue-50">{formatDate(backup.createdAt)}</td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-navy-500 dark:text-blue-300">{backup.id}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-navy-500 dark:text-blue-300">{formatBytes(backup.files.db.size)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-navy-500 dark:text-blue-300">{formatBytes(backup.files.uploads.size)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownload(backup, 'db')}
                          disabled={isActionPending || !backup.files.db.exists || downloading === `${backup.id}-db`}
                          className="btn-secondary btn-sm"
                        >
                          DB
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(backup, 'uploads')}
                          disabled={isActionPending || !backup.files.uploads.exists || downloading === `${backup.id}-uploads`}
                          className="btn-secondary btn-sm"
                        >
                          Uploads
                        </button>
                        <button
                          type="button"
                          onClick={() => openRestoreDialog(backup)}
                          disabled={isActionPending || !maintenanceEnabled || !backup.files.db.exists || !backup.files.uploads.exists}
                          className="btn-secondary btn-sm"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => setBackupToDelete(backup)}
                          disabled={isActionPending}
                          className="btn-danger btn-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-navy-950 dark:text-blue-50">Restore Notes</h2>
        <p className="mt-2 text-sm text-navy-600 dark:text-blue-200">
          Restore replaces the current database and uploads with the selected backup. The system creates a fresh pre-restore backup first, then requires you to log in again.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-navy-950 p-4 text-xs text-blue-50">
{`export BACKUP_PATH=backups/<timestamp>
docker compose stop api nginx frontend
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA IF EXISTS public CASCADE;"
gunzip -c "$BACKUP_PATH/db.sql.gz" | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
docker compose run --rm --no-deps -v "$PWD/$BACKUP_PATH:/backup" --entrypoint sh api -c "rm -rf /app/uploads/* && tar -xzf /backup/uploads.tar.gz -C /app/uploads"
docker compose up -d`}
        </pre>
      </section>

      <Modal
        isOpen={backupToRestore !== null}
        onClose={() => {
          if (!restoreBackupMutation.isPending) closeRestoreDialog();
        }}
        title="Restore Backup"
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            Restore will replace the current database and uploaded files with backup{' '}
            <span className="font-mono font-semibold">{backupToRestore?.id}</span>. This cannot be undone from the UI.
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            Restore will automatically enable <span className="font-semibold">maintenance mode</span> for the entire duration (typically 15-60 seconds). All non-admin users will be temporarily blocked.
          </div>
          <p className="text-sm text-navy-600 dark:text-blue-200">
            A fresh pre-restore backup will be created automatically before restore starts. Type the backup ID to confirm.
          </p>
          <div>
            <label htmlFor="restore-confirmation" className="label">Backup ID</label>
            <input
              id="restore-confirmation"
              type="text"
              value={restoreConfirmation}
              onChange={(event) => setRestoreConfirmation(event.target.value)}
              disabled={restoreBackupMutation.isPending}
              className="input font-mono"
              placeholder={backupToRestore?.id}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={closeRestoreDialog}
              className="btn-secondary"
              disabled={restoreBackupMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRestore}
              className="btn-danger"
              disabled={restoreBackupMutation.isPending || restoreConfirmation !== backupToRestore?.id}
            >
              {restoreBackupMutation.isPending ? 'Restoring...' : 'Restore Backup'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={backupToDelete !== null}
        onClose={() => setBackupToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Backup"
        message={`Are you sure you want to delete backup ${backupToDelete?.id ?? ''}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteBackupMutation.isPending}
      />
    </>
  );
}
