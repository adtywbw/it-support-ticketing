import ErrorMessage from '@/components/ui/ErrorMessage';
import { useFaqAnalytics } from '@/hooks/use-faqs';
import { getErrorMessage } from '@/lib/utils';

export default function FaqAnalyticsSummary() {
  const analytics = useFaqAnalytics();

  if (analytics.isLoading) {
    return (
      <section aria-label="Loading FAQ analytics" role="status">
        <span className="sr-only">Loading FAQ analytics</span>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg bg-blue-100 dark:bg-navy-800" />
          ))}
        </div>
      </section>
    );
  }

  if (analytics.isError) {
    return (
      <ErrorMessage
        message={getErrorMessage(analytics.error, 'Failed to load FAQ analytics')}
        onRetry={() => analytics.refetch()}
      />
    );
  }

  if (!analytics.data) return null;

  const data = analytics.data;
  const cards = [
    ['Recommendation sessions', data.recommendationSessions.toLocaleString()],
    ['Resolved without ticket', data.resolvedWithoutTicketSessions.toLocaleString()],
    ['Deflection rate', `${data.deflectionRate.toFixed(1)}%`],
    ['Continued to ticket', `${data.continuedToTicketRate.toFixed(1)}%`],
  ];
  const faqLists = [
    { title: 'Most opened FAQs', rows: data.topOpenedFaqs },
    { title: 'Most resolved FAQs', rows: data.topResolvedFaqs },
  ];

  return (
    <section className="mb-6 space-y-4" aria-labelledby="faq-analytics-heading">
      <div>
        <h2 id="faq-analytics-heading" className="text-lg font-semibold text-navy-950 dark:text-blue-50">
          Self-service analytics
        </h2>
        <p className="text-sm text-navy-500 dark:text-blue-300">Last 30 days</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-blue-100 bg-white p-4 dark:border-navy-800 dark:bg-navy-900">
            <p className="text-sm text-navy-500 dark:text-blue-300">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-navy-950 dark:text-blue-50">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {faqLists.map(({ title, rows }) => (
          <div key={title} className="card">
            <div className="card-header"><h3>{title}</h3></div>
            <div className="card-body">
              {rows.length === 0 ? (
                <p className="text-sm text-navy-500 dark:text-blue-300">No interaction data yet.</p>
              ) : (
                <ol className="space-y-2">
                  {rows.map((row) => (
                    <li key={row.faqId} className="flex justify-between gap-3 text-sm">
                      <span className="text-navy-800 dark:text-blue-100">{row.question}</span>
                      <span className="font-medium text-primary-700 dark:text-sky-300">{row.sessions}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header"><h3>Category opportunities</h3></div>
        <div className="card-body overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-navy-500 dark:text-blue-300">
                <th className="pb-2">Category</th>
                <th className="pb-2">Sessions</th>
                <th className="pb-2">Deflection</th>
              </tr>
            </thead>
            <tbody>
              {data.categoryStats.map((row) => (
                <tr key={row.categoryId} className="border-t border-blue-100 dark:border-navy-800">
                  <td className="py-2 text-navy-800 dark:text-blue-100">{row.categoryName}</td>
                  <td className="py-2">{row.recommendationSessions}</td>
                  <td className="py-2">{row.deflectionRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
