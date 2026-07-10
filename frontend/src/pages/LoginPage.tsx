import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { safeRedirectPath } from '@/lib/utils';
import LoginForm from '@/auth/LoginForm';
import FaqSection from '@/components/ui/FaqSection';
import BrandMark from '@/components/ui/BrandMark';

export default function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (isAuthenticated) {
    const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
    return <Navigate to={safeRedirectPath(from)} replace />;
  }

  const message = (location.state as { message?: string } | null)?.message;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.16),_transparent_34%),linear-gradient(135deg,_#f8fbff_0%,_#eff6ff_52%,_#dbeafe_100%)] px-4 py-8 text-navy-950 dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_34%),linear-gradient(135deg,_#041020_0%,_#06142b_55%,_#0b1f44_100%)] dark:text-blue-50 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl flex-col justify-center">
        <div className="overflow-hidden rounded-3xl border border-blue-100 bg-white/90 shadow-soft-lg backdrop-blur dark:border-navy-800 dark:bg-navy-900/90">
          <header className="flex flex-col gap-4 border-b border-blue-100 px-6 py-5 dark:border-navy-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <BrandMark size="lg" />
              <div>
                <p className="text-lg font-bold tracking-tight text-navy-950 dark:text-blue-50">IT HelpDesk</p>
                <p className="text-sm text-navy-500 dark:text-blue-300">IT Service Portal</p>
              </div>
            </div>
            <div className="inline-flex w-fit items-center rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-200">
              Secure Access
            </div>
          </header>

          <main className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
            <section className="border-b border-blue-100 bg-white px-6 py-8 dark:border-navy-800 dark:bg-navy-900 lg:border-b-0 lg:border-r lg:px-10 lg:py-12">
              <div className="mx-auto max-w-md">
                <div className="mb-8">
                  <p className="text-sm font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-300">Welcome back</p>
                  <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-950 dark:text-blue-50">Sign in to IT HelpDesk</h1>
                  <p className="mt-3 text-sm text-navy-600 dark:text-blue-200">Use your assigned account to submit, track, and resolve IT support tickets.</p>
                </div>

                {message && (
                  <div
                    role="status"
                    className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                  >
                    {message}
                  </div>
                )}

                <div className="rounded-2xl border border-blue-100 bg-surface-50 p-6 shadow-soft dark:border-navy-800 dark:bg-navy-950/40">
                  <LoginForm />
                </div>
              </div>
            </section>

            <aside className="bg-gradient-to-br from-primary-50 via-surface-50 to-blue-100 px-6 py-8 dark:from-navy-950 dark:via-navy-900 dark:to-primary-950 lg:px-10 lg:py-12">
              <div className="mx-auto flex h-full max-w-lg flex-col justify-between gap-8">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">Support Assist</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-navy-950 dark:text-blue-50">Need help signing in?</h2>
                  <p className="mt-3 text-sm leading-6 text-navy-600 dark:text-blue-200">
                    Contact IT Support if your account is locked, your password has expired, or you cannot access your assigned tickets.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <div className="rounded-xl border border-blue-100 bg-white/80 p-4 shadow-soft dark:border-navy-800 dark:bg-navy-900/70">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-300">Tickets</p>
                    <p className="mt-1 text-sm text-navy-700 dark:text-blue-100">Submit and track requests from one secure portal.</p>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-white/80 p-4 shadow-soft dark:border-navy-800 dark:bg-navy-900/70">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-300">Notifications</p>
                    <p className="mt-1 text-sm text-navy-700 dark:text-blue-100">Receive status updates and assignment changes in real time.</p>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-white/80 p-4 shadow-soft dark:border-navy-800 dark:bg-navy-900/70">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-300">SLA</p>
                    <p className="mt-1 text-sm text-navy-700 dark:text-blue-100">Prioritized response targets keep work visible.</p>
                  </div>
                </div>

                <FaqSection variant="portal" />
              </div>
            </aside>
          </main>
        </div>

        <footer className="px-4 py-6 text-center">
          <p className="text-xs text-navy-500 dark:text-blue-300">
            © 2026 Aditya Wibowo. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}
