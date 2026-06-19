import DashboardStats from '@/components/dashboard/DashboardStats';

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
      <DashboardStats />
    </div>
  );
}
