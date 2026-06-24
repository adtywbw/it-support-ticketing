import { useState } from 'react';
import toast from 'react-hot-toast';
import { useBackups, useCreateBackup, useDeleteBackup, downloadBackupFile } from '@/hooks/use-maintenance';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getErrorMessage } from '@/lib/utils';
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

export default function AdminMaintenancePage() {
  const { data: backups, isLoading, isError, error, refetch } = useBackups();
  const createBackupMutation = useCreateBackup();
  const deleteBackupMutation = useDeleteBackup();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [backupToDelete, setBackupToDelete] = useState<BackupInfo | null>(null);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin - Maintenance</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Create and download operational backups. Restore remains a manual maintenance-window task.
        </p>
      </div>

      <section className="card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Create Backup</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Generates a compressed PostgreSQL dump and uploads archive under the server `backups/` directory.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={createBackupMutation.isPending}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createBackupMutation.isPending ? 'Creating backup...' : 'Create Backup'}
          </button>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-gray-200 p-6 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Available Backups</h2>
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
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Backup ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Database</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Uploads</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {backups.map((backup) => (
                  <tr key={backup.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{formatDate(backup.createdAt)}</td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-gray-500 dark:text-gray-400">{backup.id}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatBytes(backup.files.db.size)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatBytes(backup.files.uploads.size)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => handleDownload(backup, 'db')}
                          disabled={!backup.files.db.exists || downloading === `${backup.id}-db`}
                          className="text-primary-600 hover:text-primary-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-primary-400 dark:hover:text-primary-300"
                        >
                          DB
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(backup, 'uploads')}
                          disabled={!backup.files.uploads.exists || downloading === `${backup.id}-uploads`}
                          className="text-primary-600 hover:text-primary-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-primary-400 dark:hover:text-primary-300"
                        >
                          Uploads
                        </button>
                        <button
                          type="button"
                          onClick={() => setBackupToDelete(backup)}
                          disabled={deleteBackupMutation.isPending}
                          className="text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:text-red-300"
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
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Restore Instructions</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Restore is intentionally manual because it is destructive. Run it during a maintenance window after creating one more fresh backup.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-gray-950 p-4 text-xs text-gray-100">
{`export BACKUP_PATH=backups/<timestamp>
docker compose stop api nginx frontend
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gunzip -c "$BACKUP_PATH/db.sql.gz" | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
docker compose run --rm --no-deps -v "$PWD/$BACKUP_PATH:/backup" --entrypoint sh api -c "rm -rf /app/uploads/* && tar -xzf /backup/uploads.tar.gz -C /app/uploads"
docker compose up -d`}
        </pre>
      </section>

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
    </div>
  );
}
