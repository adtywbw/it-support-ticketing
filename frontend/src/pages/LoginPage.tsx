import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { safeRedirectPath } from '@/lib/utils';
import LoginForm from '@/auth/LoginForm';

export default function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (isAuthenticated) {
    const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
    return <Navigate to={safeRedirectPath(from)} replace />;
  }

  const message = (location.state as { message?: string } | null)?.message;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-white font-bold text-lg mb-4">
            IT
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Sign in to Support Hub</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Enter your credentials to access the ticketing system
          </p>
        </div>

        {message && (
          <div
            role="status"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
          >
            {message}
          </div>
        )}

        <div className="card p-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
