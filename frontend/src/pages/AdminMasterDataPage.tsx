import MasterDataManagement from '@/components/admin/MasterDataManagement';

export default function AdminMasterDataPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-navy-950 dark:text-blue-50">Admin - Master Data</h1>
      <MasterDataManagement />
    </div>
  );
}
