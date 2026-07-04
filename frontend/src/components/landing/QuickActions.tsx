import { useNavigate } from 'react-router-dom';
import { LANDING_QUICK_ACTIONS } from '@/lib/landing-defaults';

export default function QuickActions() {
  const navigate = useNavigate();

  return (
    <section className="mx-auto max-w-4xl px-4 py-16">
      <div className="grid gap-6 sm:grid-cols-2">
        {LANDING_QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            onClick={() => navigate('/login')}
            className="card p-6 text-left transition-shadow hover:shadow-md dark:bg-gray-800"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {action.title}
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {action.description}
            </p>
            <span className="mt-4 inline-block text-sm font-medium text-primary-600 dark:text-primary-400">
              {action.ctaLabel} →
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
