import { useMaintenanceMode } from '@/hooks/use-maintenance';
import { useAuthStore } from '@/stores/auth-store';

export default function MaintenanceBanner() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: maintenance } = useMaintenanceMode({ enabled: isAuthenticated });

  if (!maintenance?.enabled) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-amber-600 px-4 py-3 text-center text-sm font-medium text-white shadow-lg">
      {maintenance.message || 'System sedang dalam pemeliharaan. Silakan coba lagi beberapa saat.'}
    </div>
  );
}
