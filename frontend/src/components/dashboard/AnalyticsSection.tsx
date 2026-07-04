import type { DashboardAnalytics } from '@/types';

type AnalyticsSectionProps = {
  analytics: DashboardAnalytics;
};

const statusLabels: Record<string, string> = {
  Open: 'Open',
  InProgress: 'In Progress',
  OnHold: 'On Hold',
  Resolved: 'Resolved',
  Closed: 'Closed',
};

const statusColors: Record<string, string> = {
  Open: 'bg-blue-500',
  InProgress: 'bg-yellow-500',
  OnHold: 'bg-purple-500',
  Resolved: 'bg-green-500',
  Closed: 'bg-slate-500',
};

const priorityColors: Record<string, string> = {
  Low: 'bg-slate-400',
  Medium: 'bg-blue-400',
  High: 'bg-orange-400',
  Critical: 'bg-red-500',
};

function formatMinutes(minutes: number) {
  if (minutes >= 60) return `${(minutes / 60).toFixed(1)}h`;
  if (minutes >= 1) return `${Math.round(minutes)}m`;
  return `${Math.round(minutes * 60)}s`;
}

function DistributionCard({
  title,
  items,
  colors,
  labels = {},
}: {
  title: string;
  items: Array<{ key: string; count: number }>;
  colors: Record<string, string>;
  labels?: Record<string, string>;
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      </div>
      <div className="card-body">
        {total === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No data for this period</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.key} className="flex items-center gap-3">
                <span className="w-24 text-sm text-slate-600 dark:text-slate-400">{labels[item.key] ?? item.key}</span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div className={`h-full rounded-full ${colors[item.key] ?? 'bg-slate-400'}`} style={{ width: `${(item.count / total) * 100}%` }} />
                </div>
                <span className="w-12 text-right text-sm font-medium text-slate-700 dark:text-slate-300">{item.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsSection({ analytics }: AnalyticsSectionProps) {
  const maxTrend = Math.max(...analytics.trend.map((item) => item.count), 0);
  const statusItems = Object.entries(analytics.statusCounts).map(([key, count]) => ({ key, count }));
  const priorityItems = Object.entries(analytics.priorityCounts).map(([key, count]) => ({ key, count }));

  return (
    <section aria-labelledby="analytics-heading" className="space-y-4">
      <div>
        <h2 id="analytics-heading" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Analytics
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {analytics.range.from} to {analytics.range.to}
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Ticket Trend</h3>
        </div>
        <div className="card-body">
          {analytics.trend.length === 0 || maxTrend === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No ticket activity in this period</p>
          ) : (
            <div className="flex h-36 items-end gap-1">
              {analytics.trend.map((item) => (
                <div key={item.date} className="flex flex-1 flex-col items-center gap-1" title={`${item.date}: ${item.count} tickets`}>
                  <div className="w-full rounded-t bg-primary-500" style={{ height: `${(item.count / maxTrend) * 100}%` }} />
                  <span className="origin-left rotate-45 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">{item.date.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="card-body">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">SLA Compliance</p>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">{analytics.slaComplianceRate.toFixed(0)}%</p>
          </div>
        </div>

        <DistributionCard title="Tickets by Status" items={statusItems} colors={statusColors} labels={statusLabels} />
        <DistributionCard title="Tickets by Priority" items={priorityItems} colors={priorityColors} />

        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Top Categories</h3>
          </div>
          <div className="card-body">
            {analytics.topCategories.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">No category data for this period</p>
            ) : (
              <div className="space-y-2">
                {analytics.topCategories.map((item) => (
                  <div key={item.categoryId} className="flex items-center justify-between text-sm">
                    <span className="truncate text-slate-600 dark:text-slate-400">{item.categoryName}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Avg Resolution Time by Category</h3>
          </div>
          <div className="card-body">
            {analytics.avgResolutionTimeByCategory.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">No resolved tickets in this period</p>
            ) : (
              <div className="space-y-2">
                {analytics.avgResolutionTimeByCategory.map((item) => (
                  <div key={item.categoryId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-slate-600 dark:text-slate-400">{item.categoryName}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{formatMinutes(item.avgResolutionMinutes)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
