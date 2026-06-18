import { useState } from 'react';
import { useUsers, useCreateUser, useUpdateUser } from '@/hooks/use-users';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { User, UserRole, CreateUserPayload, UpdateUserPayload } from '@/types';

type UserFormMode = 'create' | 'edit';

interface UserFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
}

const initialFormData: UserFormData = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  role: 'User',
  isActive: true,
};

export default function UserManagement() {
  const { data: users, isLoading, isError, error, refetch } = useUsers();
  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mode, setMode] = useState<UserFormMode>('create');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>(initialFormData);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [userToToggle, setUserToToggle] = useState<User | null>(null);

  const openCreate = () => {
    setMode('create');
    setEditingUser(null);
    setFormData(initialFormData);
    setIsModalOpen(true);
  };

  const openEdit = (user: User) => {
    setMode('edit');
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (mode === 'create') {
      await createUserMutation.mutateAsync(formData as CreateUserPayload);
    } else if (editingUser) {
      const payload: UpdateUserPayload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        isActive: formData.isActive,
      };
      await updateUserMutation.mutateAsync({ id: editingUser.id, payload });
    }
    setIsModalOpen(false);
  };

  const handleToggleActive = async () => {
    if (!userToToggle) return;
    await updateUserMutation.mutateAsync({
      id: userToToggle.id,
      payload: { isActive: !userToToggle.isActive },
    });
    setIsConfirmOpen(false);
    setUserToToggle(null);
  };

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
        message={(error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load users'}
        onRetry={() => refetch()}
      />
    );
  }

  const isPending = createUserMutation.isPending || updateUserMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
        <button onClick={openCreate} className="btn-primary">
          Add User
        </button>
      </div>

      {!users || users.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No users found"
            description="Create your first user to get started."
            action={
              <button onClick={openCreate} className="btn-primary">
                Add User
              </button>
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                          {u.firstName.charAt(0)}{u.lastName.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {u.firstName} {u.lastName}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        u.role === 'Admin' ? 'bg-purple-100 text-purple-800' :
                        u.role === 'ITSupport' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        u.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button onClick={() => openEdit(u)} className="text-primary-600 hover:text-primary-800 mr-3">
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setUserToToggle(u);
                          setIsConfirmOpen(true);
                        }}
                        className={`${u.isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={mode === 'create' ? 'Create User' : 'Edit User'}
      >
        <div className="space-y-4">
          <div>
            <label className="label">First Name</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label">Last Name</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="input"
              disabled={mode === 'edit'}
            />
          </div>
          {mode === 'create' && (
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="input"
              />
            </div>
          )}
          <div>
            <label className="label">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
              className="input"
            >
              <option value="User">User</option>
              <option value="ITSupport">IT Support</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setIsModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button onClick={handleSubmit} className="btn-primary" disabled={isPending}>
              {isPending ? 'Saving...' : mode === 'create' ? 'Create User' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleToggleActive}
        title={userToToggle?.isActive ? 'Deactivate User' : 'Activate User'}
        message={`Are you sure you want to ${userToToggle?.isActive ? 'deactivate' : 'activate'} ${userToToggle?.firstName} ${userToToggle?.lastName}?`}
        confirmLabel={userToToggle?.isActive ? 'Deactivate' : 'Activate'}
        variant={userToToggle?.isActive ? 'danger' : 'primary'}
        isLoading={isPending}
      />
    </div>
  );
}
