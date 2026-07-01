import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNotifications, useMarkAsRead, useMarkAllAsRead, useClearAll } from '@/hooks/use-notifications';
import { formatRelativeTime, getErrorMessage } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import Pagination from '@/components/ui/Pagination';

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const { data: notifData, isLoading, isError, error, refetch } = useNotifications(page, limit);
  const notifications = notifData?.data ?? [];
  const meta = notifData?.meta;
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const clearAll = useClearAll();

  if (isLoading) {
    return (
      <div className="card p-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card">
        <ErrorMessage
          title="Failed to load notifications"
          message={getErrorMessage(error, 'Unable to load notifications. Please try again.')}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <button
              onClick={() => clearAll.mutate()}
              className="btn-secondary btn-sm"
              disabled={clearAll.isPending}
            >
              Clear all
            </button>
          )}
          {notifications.some((n) => !n.isRead) && (
            <button
              onClick={() => markAllAsRead.mutate()}
              className="btn-secondary btn-sm"
              disabled={markAllAsRead.isPending}
            >
              Mark all as read
            </button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="card">
          <EmptyState title="No notifications" description="You have no notifications at this time." />
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`card p-4 cursor-pointer transition-colors ${
                !notif.isRead ? 'border-primary-200 bg-primary-50/50' : ''
              }`}
              onClick={() => {
                if (!notif.isRead) markAsRead.mutate(notif.id);
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className={`text-sm ${!notif.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {notif.title}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">{notif.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(notif.createdAt)}</p>
                </div>
                {!notif.isRead && (
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary-500 shrink-0" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {meta && (
        <Pagination
          page={page}
          totalPages={meta.totalPages ?? 1}
          onPageChange={(p) => setPage(p)}
          limit={limit}
          onLimitChange={(l) => { setLimit(l); setPage(1); }}
          totalItems={meta.total}
        />
      )}

      <div className="text-center">
        <Link to="/tickets" className="text-sm text-primary-600 hover:text-primary-800">
          Back to Tickets
        </Link>
      </div>
    </div>
  );
}
