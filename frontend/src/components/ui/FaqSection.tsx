import { useFaqs } from '@/hooks/use-faqs';
import { cn } from '@/lib/utils';

interface FaqSectionProps {
  variant?: 'standalone' | 'portal';
  className?: string;
}

export default function FaqSection({ variant = 'standalone', className }: FaqSectionProps) {
  const { data: faqs, isLoading } = useFaqs();

  if (isLoading) return null;
  if (!faqs || faqs.length === 0) return null;

  const isPortal = variant === 'portal';

  return (
    <section
      className={cn(
        isPortal ? 'w-full' : 'mx-auto w-full max-w-lg px-4 pb-8',
        className,
      )}
      aria-label="Frequently Asked Questions"
    >
      <h2 className={cn(
        'font-semibold text-navy-950 dark:text-blue-50',
        isPortal ? 'mb-3 text-base' : 'mb-4 text-center text-lg',
      )}
      >
        Frequently Asked Questions
      </h2>
      <div className="space-y-2">
        {faqs.map((faq) => (
          <details
            key={faq.id}
            className="group rounded-lg border border-blue-100 bg-white/90 px-4 py-3 text-sm shadow-soft dark:border-navy-800 dark:bg-navy-900/80"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium text-navy-800 dark:text-blue-100">
              <span>{faq.question}</span>
              <svg
                className="h-4 w-4 shrink-0 text-primary-500 transition-transform group-open:rotate-180 dark:text-sky-300"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </summary>
            <p className="mt-2 text-navy-600 dark:text-blue-200">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
