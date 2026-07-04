import { useMaintenanceMode } from '@/hooks/use-maintenance';
import { useAuthStore } from '@/stores/auth-store';

export default function MaintenanceBanner() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const { data: maintenance } = useMaintenanceMode({ enabled: isAuthenticated });

  if (!maintenance?.enabled) return null;

  const message = maintenance.message || 'System sedang dalam pemeliharaan. Silakan coba lagi beberapa saat.';

  if (user?.role !== 'Admin') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/95 px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 text-white">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white">Sistem Dalam Pemeliharaan</h2>
          <p className="mt-2 text-sm text-slate-300">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-amber-600 px-4 py-3 text-center text-sm font-medium text-white shadow-lg">
      {message}
    </div>
  );
}
