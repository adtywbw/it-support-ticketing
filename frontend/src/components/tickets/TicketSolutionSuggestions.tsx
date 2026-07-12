import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useFaqRecommendations, useRecordFaqInteraction } from '@/hooks/use-faqs';
import type { FaqInteractionPayload } from '@/types';

interface TicketSolutionSuggestionsProps {
  sessionId: string;
  subCategoryId?: string;
  subject: string;
}

export default function TicketSolutionSuggestions({
  sessionId,
  subCategoryId,
  subject,
}: TicketSolutionSuggestionsProps) {
  const [debouncedSubject, setDebouncedSubject] = useState('');
  const [resolved, setResolved] = useState<{
    subCategoryId: string;
    faqId: string;
  } | null>(null);
  const shownSubCategoriesRef = useRef(new Set<string>());
  const openedBySubCategoryRef = useRef(new Map<string, Set<string>>());
  const interactionErrorShownRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSubject(subject.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [subject]);

  const recommendations = useFaqRecommendations({
    subCategoryId: subCategoryId || undefined,
    query: debouncedSubject.length >= 3 ? debouncedSubject : undefined,
  });
  const { mutateAsync: recordInteraction } = useRecordFaqInteraction();

  const getOpenedForCurrentSubCategory = useCallback(() => {
    if (!subCategoryId) return undefined;
    let opened = openedBySubCategoryRef.current.get(subCategoryId);
    if (!opened) {
      opened = new Set<string>();
      openedBySubCategoryRef.current.set(subCategoryId, opened);
    }
    return opened;
  }, [subCategoryId]);

  const record = useCallback(
    async (payload: FaqInteractionPayload) => {
      try {
        await recordInteraction(payload);
      } catch {
        if (!interactionErrorShownRef.current) {
          interactionErrorShownRef.current = true;
          toast.error('Unable to record self-service feedback', {
            id: `faq-interaction-${sessionId}`,
          });
        }
      }
    },
    [recordInteraction, sessionId],
  );

  useEffect(() => {
    if (
      subCategoryId &&
      !shownSubCategoriesRef.current.has(subCategoryId) &&
      recommendations.data?.length
    ) {
      shownSubCategoriesRef.current.add(subCategoryId);
      void record({
        sessionId,
        subCategoryId,
        eventType: 'RecommendationsShown',
      });
    }
  }, [subCategoryId, recommendations.data, record, sessionId]);

  const openArticle = (faqId: string) => {
    if (!subCategoryId) return;
    const opened = getOpenedForCurrentSubCategory();
    if (opened?.has(faqId)) return;
    opened?.add(faqId);
    void record({ sessionId, faqId, eventType: 'ArticleOpened' });
  };

  const resolveProblem = (faqId: string) => {
    if (!subCategoryId) return;
    setResolved({ subCategoryId, faqId });
    void record({ sessionId, faqId, eventType: 'ProblemResolved' });
  };

  const canRecommend = Boolean(subCategoryId);

  if (!canRecommend || recommendations.isError) return null;

  if (recommendations.isLoading) {
    return (
      <section
        className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-navy-700 dark:bg-navy-900"
        role="status"
        aria-label="Loading suggested solutions"
      >
        <span className="sr-only">Loading suggested solutions</span>
        <div className="space-y-2 animate-pulse" aria-hidden="true">
          <div className="h-4 w-48 rounded bg-blue-200 dark:bg-navy-700" />
          <div className="h-10 rounded bg-white dark:bg-navy-800" />
          <div className="h-10 rounded bg-white dark:bg-navy-800" />
        </div>
      </section>
    );
  }

  if (!recommendations.data?.length) return null;

  if (resolved && resolved.subCategoryId === subCategoryId) {
    return (
      <section
        className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30"
        aria-live="polite"
      >
        <h2 className="font-semibold text-emerald-900 dark:text-emerald-100">
          Glad this solved your problem
        </h2>
        <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
          You can return to your tickets, or continue below if you still need support.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/tickets" className="btn-primary btn-sm">
            Back to tickets
          </Link>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setResolved(null)}
          >
            Continue creating ticket
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border border-primary-200 bg-primary-50 p-4 dark:border-navy-700 dark:bg-navy-900"
      aria-labelledby="suggested-solutions-heading"
    >
      <h2
        id="suggested-solutions-heading"
        className="font-semibold text-navy-950 dark:text-blue-50"
      >
        Solutions that might help
      </h2>
      <p className="mt-1 text-sm text-navy-600 dark:text-blue-200">
        Try one of these before submitting a ticket.
      </p>
      <div className="mt-3 space-y-2">
        {recommendations.data.map((faq) => (
          <details
            key={faq.id}
            className="rounded-md border border-blue-100 bg-white px-3 py-2 dark:border-navy-700 dark:bg-navy-800"
            onToggle={(event) => {
              if (event.currentTarget.open) openArticle(faq.id);
            }}
          >
            <summary className="cursor-pointer font-medium text-navy-800 dark:text-blue-100">
              {faq.question}
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-sm text-navy-600 dark:text-blue-200">
              {faq.answer}
            </p>
            <p className="mt-3 text-sm font-medium text-navy-800 dark:text-blue-100">
              Did this solution resolve your problem?
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => resolveProblem(faq.id)}
              >
                Yes, problem resolved
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={(event) => {
                  const details = event.currentTarget.closest('details');
                  if (details) details.open = false;
                }}
              >
                Not yet, continue creating ticket
              </button>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
