import MasterDataManagement from '@/components/admin/MasterDataManagement';

export default function AdminMasterDataPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin - Master Data</h1>
      <MasterDataManagement />
    </div>
  );
}
