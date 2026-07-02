import { useDashboardStats } from '@/hooks/use-dashboard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { getErrorMessage } from '@/lib/utils';
import type { DashboardStatsQuery } from '@/types';
import CurrentSnapshotCards from './CurrentSnapshotCards';
import NeedAttentionSection from './NeedAttentionSection';
import AnalyticsSection from './AnalyticsSection';

type DashboardStatsProps = {
  range: DashboardStatsQuery;
};

export default function DashboardStats({ range }: DashboardStatsProps) {
  const { data: stats, isLoading, isError, error, refetch } = useDashboardStats(range);

  if (isLoading) {
    return (
      <div className="card p-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return <ErrorMessage message={getErrorMessage(error, 'Failed to load dashboard stats')} onRetry={() => refetch()} />;
  }

  if (!stats) {
    return (
      <div className="card p-12">
        <p className="text-center text-gray-500 dark:text-gray-400">No dashboard data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CurrentSnapshotCards current={stats.current} />
      <NeedAttentionSection attention={stats.attention} />
      <AnalyticsSection analytics={stats.analytics} />
    </div>
  );
}
