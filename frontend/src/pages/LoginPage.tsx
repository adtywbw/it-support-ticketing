import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { safeRedirectPath } from '@/lib/utils';
import LoginForm from '@/auth/LoginForm';
import FaqSection from '@/components/ui/FaqSection';

export default function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (isAuthenticated) {
    const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
    return <Navigate to={safeRedirectPath(from)} replace />;
  }

  const message = (location.state as { message?: string } | null)?.message;

  return (
    <div className="flex min-h-screen">
      {/* Brand panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between bg-slate-900 p-12 overflow-hidden">
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900/40 via-slate-900 to-slate-950" />
        {/* Decorative blob */}
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary-600/10 blur-3xl" />

        <div className="relative z-10 flex h-full flex-col justify-between">
          {/* Top: logo + product name */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white font-bold">
              SH
            </div>
            <span className="text-xl font-semibold text-slate-100">Support Hub</span>
          </div>

          {/* Middle: tagline + feature bullets */}
          <div>
            <h2 className="text-3xl font-bold text-white leading-tight">
              IT support, simplified.
            </h2>
            <p className="mt-3 text-base text-slate-400">
              Submit, track, and resolve IT tickets — all in one place.
            </p>
            <ul className="mt-8 space-y-4">
              <li className="flex items-start gap-3 text-slate-300">
                <svg className="h-5 w-5 shrink-0 text-primary-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25" />
                </svg>
                <span>Submit & track support tickets with ease</span>
              </li>
              <li className="flex items-start gap-3 text-slate-300">
                <svg className="h-5 w-5 shrink-0 text-primary-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                <span>Real-time notifications and status updates</span>
              </li>
              <li className="flex items-start gap-3 text-slate-300">
                <svg className="h-5 w-5 shrink-0 text-primary-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0Z" />
                </svg>
                <span>SLA-backed response times you can rely on</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Form column */}
      <div className="flex w-full flex-col lg:w-1/2 bg-slate-50 dark:bg-slate-900">
        {/* Form area — centered */}
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
          {/* Logo — mobile only (desktop has brand panel) */}
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-white font-bold text-lg lg:hidden">
            SH
          </div>

          <div className="w-full max-w-sm">
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Sign in to Support Hub</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
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

            <div className="card p-6 shadow-soft-lg">
              <LoginForm />
            </div>
          </div>
        </div>

        {/* FAQ */}
        <FaqSection />

        {/* Footer */}
        <footer className="px-4 py-6 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            © {new Date().getFullYear()} Support Hub. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}
