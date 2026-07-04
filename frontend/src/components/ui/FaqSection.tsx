import { useFaqs } from '@/hooks/use-faqs';

export default function FaqSection() {
  const { data: faqs, isLoading } = useFaqs();

  if (isLoading) return null;
  if (!faqs || faqs.length === 0) return null;

  return (
    <section className="w-full max-w-2xl mx-auto mt-10" aria-label="Frequently Asked Questions">
      <h2 className="text-center text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Frequently Asked Questions
      </h2>
      <div className="space-y-2">
        {faqs.map((faq) => (
          <details
            key={faq.id}
            className="group rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <summary className="flex cursor-pointer items-center justify-between font-medium text-gray-800 dark:text-gray-200">
              <span>{faq.question}</span>
              <svg
                className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </summary>
            <p className="mt-2 text-gray-600 dark:text-gray-400">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
