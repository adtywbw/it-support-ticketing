import UserManagement from '@/components/admin/UserManagement';

export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Admin - User Management</h1>
      <UserManagement />
    </div>
  );
}
