import { useAuthStore } from '@/stores/auth-store';
import NotificationPreferencesSection from '@/components/account/NotificationPreferencesSection';
import PasswordChangeSection from '@/components/account/PasswordChangeSection';
import TelegramConfigSection from '@/components/account/TelegramConfigSection';
import { getUserDisplayName, getUserInitials } from '@/lib/utils';

export default function MyAccountPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-navy-950 dark:text-blue-50">My Account</h1>

      <div className="card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-100 text-lg font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
            {user ? getUserInitials(user) : '?'}
          </div>
          <div>
            <p className="text-lg font-semibold text-navy-950 dark:text-blue-50">
              {user ? getUserDisplayName(user) : 'User'}
            </p>
            <p className="text-sm text-navy-500 dark:text-blue-300">{user?.email}</p>
            <span className="inline-block mt-1 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/20 dark:text-primary-300">
              {user?.role}
            </span>
          </div>
        </div>

        <NotificationPreferencesSection />

        {user?.role !== 'EndUser' && <PasswordChangeSection />}

        {user?.role === 'Admin' && <TelegramConfigSection />}
      </div>
    </div>
  );
}
