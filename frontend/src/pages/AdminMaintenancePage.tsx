import { useMaintenanceMode, useSetMaintenanceMode } from '@/hooks/use-maintenance';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';
import BackupManager from '@/components/admin/BackupManager';

export default function AdminMaintenancePage() {
  const { data: maintenanceStatus } = useMaintenanceMode();
  const setMaintenanceModeMutation = useSetMaintenanceMode();
  const isActionPending = setMaintenanceModeMutation.isPending;

  const handleToggleMaintenance = async () => {
    try {
      const newEnabled = !maintenanceStatus?.enabled;
      await setMaintenanceModeMutation.mutateAsync({
        enabled: newEnabled,
        message: newEnabled ? 'System is currently undergoing maintenance. Please try again later.' : undefined,
      });
      toast.success(newEnabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to toggle maintenance mode'));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-950 dark:text-blue-50">Admin - Maintenance</h1>
        <p className="mt-1 text-sm text-navy-500 dark:text-blue-300">
          Create, download, restore, and delete operational backups.
        </p>
      </div>

      <section className="card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-navy-950 dark:text-blue-50">Maintenance Mode</h2>
            <p className="mt-1 text-sm text-navy-500 dark:text-blue-300">
              Must be enabled before creating or restoring backups. Non-admin users cannot access the system while this is on.
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleMaintenance}
            disabled={isActionPending}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              maintenanceStatus?.enabled
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-amber-600 text-white hover:bg-amber-700'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {setMaintenanceModeMutation.isPending
              ? 'Updating...'
              : maintenanceStatus?.enabled
                ? 'Disable Maintenance'
                : 'Enable Maintenance'}
          </button>
        </div>
        {maintenanceStatus?.enabled && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
            Maintenance mode is currently <span className="font-semibold">enabled</span>.
            {maintenanceStatus.message && ` Message: "${maintenanceStatus.message}"`}
          </div>
        )}
      </section>

      <BackupManager maintenanceEnabled={maintenanceStatus?.enabled ?? false} />
    </div>
  );
}
