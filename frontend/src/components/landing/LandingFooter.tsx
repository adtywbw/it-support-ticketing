import { useNavigate } from 'react-router-dom';
import { LANDING_FOOTER } from '@/lib/landing-defaults';

export default function LandingFooter() {
  const navigate = useNavigate();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 dark:border-gray-700">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white font-bold text-sm">
            IT
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {LANDING_FOOTER.orgName}
          </span>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
        >
          {LANDING_FOOTER.signInLabel}
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          &copy; {year} {LANDING_FOOTER.orgName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
