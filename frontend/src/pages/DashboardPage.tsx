import { useState } from 'react';
import DashboardStats from '@/components/dashboard/DashboardStats';
import DashboardRangeFilter from '@/components/dashboard/DashboardRangeFilter';
import { DEFAULT_DASHBOARD_QUERY } from '@/hooks/use-dashboard';
import type { DashboardStatsQuery } from '@/types';

export default function DashboardPage() {
  const [range, setRange] = useState<DashboardStatsQuery>(DEFAULT_DASHBOARD_QUERY);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-950 dark:text-blue-50">Dashboard</h1>
          <p className="mt-1 text-sm text-navy-500 dark:text-blue-300">Operational overview and support performance</p>
        </div>
        <DashboardRangeFilter value={range} onChange={setRange} />
      </div>
      <DashboardStats range={range} />
    </div>
  );
}
