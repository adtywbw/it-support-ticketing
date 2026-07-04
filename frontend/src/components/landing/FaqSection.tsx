import { useState } from 'react';
import type { FaqEntry } from '@/types';
import { LANDING_EMPTY_FAQ_MESSAGE } from '@/lib/landing-defaults';

interface FaqSectionProps {
  faqs: FaqEntry[];
}

export default function FaqSection({ faqs }: FaqSectionProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (faqs.length === 0) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-16">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Frequently Asked Questions</h2>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{LANDING_EMPTY_FAQ_MESSAGE}</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-16">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Frequently Asked Questions</h2>
      <div className="mt-6 space-y-3">
        {faqs.map((faq) => {
          const isOpen = openId === faq.id;
          return (
            <div
              key={faq.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <button
                onClick={() => setOpenId(isOpen ? null : faq.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                aria-expanded={isOpen}
              >
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {faq.question}
                </span>
                <svg
                  className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-400">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
