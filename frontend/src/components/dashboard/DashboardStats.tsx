import { useDashboardStats } from '@/hooks/use-dashboard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';

export default function DashboardStats() {
  const { data: stats, isLoading, isError, error, refetch } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="card p-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorMessage
        message={(error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load dashboard stats'}
        onRetry={() => refetch()}
      />
    );
  }

  if (!stats) {
    return (
      <div className="card p-12">
        <p className="text-center text-gray-500 dark:text-gray-400">No dashboard data available.</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    Open: 'bg-blue-500',
    InProgress: 'bg-yellow-500',
    Resolved: 'bg-green-500',
    Closed: 'bg-gray-500',
  };

  const priorityColors: Record<string, string> = {
    Low: 'bg-gray-400',
    Medium: 'bg-blue-400',
    High: 'bg-orange-400',
    Critical: 'bg-red-500',
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="card-body">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Tickets</p>
            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">{stats.totalTickets}</p>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">SLA Compliance</p>
            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
              {(stats.slaComplianceRate * 100).toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="card-body">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Tickets by Status</p>
            {stats.ticketsByStatus.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No data</p>
            ) : (
              <div className="space-y-2">
                {stats.ticketsByStatus.map((item) => (
                  <div key={item.status} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-gray-600 dark:text-gray-400">
                      {item.status === 'InProgress' ? 'In Progress' : item.status}
                    </span>
                    <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${statusColors[item.status] || 'bg-gray-400'}`}
                        style={{
                          width: `${stats.totalTickets > 0 ? (item.count / stats.totalTickets) * 100 : 0}%`,
                        }}
                      />
                    </div>
<span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-12 text-right">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tickets by Priority</h3>
          </div>
          <div className="card-body">
            {stats.ticketsByPriority.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No data</p>
            ) : (
              <div className="space-y-2">
                {stats.ticketsByPriority.map((item) => (
                  <div key={item.priority} className="flex items-center gap-3">
                    <span className="w-16 text-sm text-gray-600 dark:text-gray-400">{item.priority}</span>
                    <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${priorityColors[item.priority] || 'bg-gray-400'}`}
                        style={{
                          width: `${stats.totalTickets > 0 ? (item.count / stats.totalTickets) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-12 text-right">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Avg Resolution Time by Category</h3>
          </div>
          <div className="card-body">
            {stats.avgResolutionTimeByCategory.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No data</p>
            ) : (
              <div className="space-y-2">
                {stats.avgResolutionTimeByCategory.map((item) => (
                  <div key={item.category} className="flex items-center gap-3">
                    <span className="w-32 text-sm text-gray-600 dark:text-gray-400 truncate">{item.category}</span>
                    <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary-500"
                        style={{
                          width: `${Math.min((item.avgHours / 48) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 text-right">
                      {item.avgHours.toFixed(1)}h
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tickets Trend</h3>
        </div>
        <div className="card-body">
          {stats.ticketsTrend.length === 0 || stats.ticketsTrend.every((t) => t.count === 0) ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No ticket activity in the last 7 days</p>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {stats.ticketsTrend.map((item) => {
                const maxCount = Math.max(...stats.ticketsTrend.map((t) => t.count));
                const height = (item.count / maxCount) * 100;
                return (
                  <div
                    key={item.date}
                    className="flex-1 flex flex-col items-center gap-1"
                    title={`${item.date}: ${item.count} tickets`}
                  >
                    <div
                      className="w-full rounded-t bg-primary-500 transition-all"
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400 rotate-45 origin-left whitespace-nowrap">
                      {item.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
