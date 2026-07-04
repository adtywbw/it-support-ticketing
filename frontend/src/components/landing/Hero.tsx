import { useNavigate } from 'react-router-dom';
import { LANDING_HERO } from '@/lib/landing-defaults';

export default function Hero() {
  const navigate = useNavigate();

  return (
    <section className="bg-gradient-to-b from-primary-50 to-white dark:from-gray-800 dark:to-gray-900">
      <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:py-28">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 text-white font-bold text-2xl">
          IT
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-5xl">
          {LANDING_HERO.title}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
          {LANDING_HERO.subtitle}
        </p>
        <button
          onClick={() => navigate('/login')}
          className="btn-primary mt-8 px-8 py-3 text-base"
        >
          {LANDING_HERO.ctaLabel}
        </button>
      </div>
    </section>
  );
}
