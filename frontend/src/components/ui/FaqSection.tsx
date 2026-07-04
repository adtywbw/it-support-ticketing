import { useFaqs } from '@/hooks/use-faqs';

export default function FaqSection() {
  const { data: faqs, isLoading } = useFaqs();

  if (isLoading) return null;
  if (!faqs || faqs.length === 0) return null;

  return (
    <section className="w-full max-w-lg mx-auto px-4 pb-8" aria-label="Frequently Asked Questions">
      <h2 className="text-center text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
        Frequently Asked Questions
      </h2>
      <div className="space-y-2">
        {faqs.map((faq) => (
          <details
            key={faq.id}
            className="group rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <summary className="flex cursor-pointer items-center justify-between font-medium text-slate-800 dark:text-slate-200">
              <span>{faq.question}</span>
              <svg
                className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </summary>
            <p className="mt-2 text-slate-600 dark:text-slate-400">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
