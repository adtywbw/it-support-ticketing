import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import LoginForm from '@/components/auth/LoginForm';

export default function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/tickets" replace />;
  }

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

        <div className="card p-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
