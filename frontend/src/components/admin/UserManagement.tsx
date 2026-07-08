import { useState } from 'react';
import toast from 'react-hot-toast';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '@/hooks/use-users';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import PasswordInput from '@/components/ui/PasswordInput';
import Pagination from '@/components/ui/Pagination';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import { getErrorMessage, getUserDisplayName } from '@/lib/utils';
import type { User, UserRole, CreateUserPayload, UpdateUserPayload } from '@/types';

type UserFormMode = 'create' | 'edit';

interface UserFormData {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  isActive: boolean;
}

const initialFormData: UserFormData = {
  email: '',
  password: '',
  name: '',
  role: 'EndUser',
  isActive: true,
};

export default function UserManagement() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { data: usersData, isLoading, isError, error, refetch } = useUsers({ page, limit });
  const users = usersData?.data ?? [];
  const meta = usersData?.meta;
  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const deleteUserMutation = useDeleteUser();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mode, setMode] = useState<UserFormMode>('create');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>(initialFormData);
  const [formError, setFormError] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [userToToggle, setUserToToggle] = useState<User | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [blockedItem, setBlockedItem] = useState<{ name: string; reasons: string[] } | null>(null);

  const openCreate = () => {
    setMode('create');
    setEditingUser(null);
    setFormData(initialFormData);
    setFormError('');
    setIsModalOpen(true);
  };

  const openEdit = (user: User) => {
    setMode('edit');
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    setFormError('');
    // Client-side validation
    if (!formData.name.trim()) {
      setFormError('Name is required');
      return;
    }
    if (mode === 'create') {
      if (!formData.email.trim()) {
        setFormError('Email is required');
        return;
      }
      if (!formData.password) {
        setFormError('Password is required');
        return;
      }
    }
    try {
      if (mode === 'create') {
        const payload: CreateUserPayload = {
          email: formData.email,
          password: formData.password,
          name: formData.name,
          role: formData.role,
        };
        await createUserMutation.mutateAsync(payload);
      } else if (editingUser) {
        const payload: UpdateUserPayload = {
          name: formData.name,
          role: formData.role,
        };
        if (formData.password) {
          payload.password = formData.password;
        }
        await updateUserMutation.mutateAsync({ id: editingUser.id, payload });
      }
      setIsModalOpen(false);
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, 'An error occurred'));
    }
  };

  const handleToggleActive = async () => {
    if (!userToToggle) return;
    try {
      await updateUserMutation.mutateAsync({
        id: userToToggle.id,
        payload: { isActive: !userToToggle.isActive },
      });
      setIsConfirmOpen(false);
      setUserToToggle(null);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'An error occurred'));
    }
  };

  const handleDelete = async () => {
    if (!userToDelete) return;
    try {
      await deleteUserMutation.mutateAsync(userToDelete.id);
      setIsDeleteConfirmOpen(false);
      setUserToDelete(null);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'An error occurred'));
    }
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
        message={getErrorMessage(error, 'Failed to load users')}
        onRetry={() => refetch()}
      />
    );
  }

  const isPending = createUserMutation.isPending || updateUserMutation.isPending || deleteUserMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-navy-950 dark:text-blue-50">User Management</h2>
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
            <table className="min-w-full divide-y divide-blue-100 dark:divide-navy-800">
              <thead className="bg-blue-50 dark:bg-navy-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-blue-100 dark:bg-navy-900 dark:divide-navy-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-blue-50 dark:hover:bg-navy-800/60">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} size="sm" />
                        <span className="text-sm font-medium text-navy-950 dark:text-blue-50">
                          {getUserDisplayName(u)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-navy-500 dark:text-blue-300">{u.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="primary">{u.role}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {u.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(u)} className="btn-secondary btn-sm">Edit</button>
                        <button
                          onClick={() => {
                            setUserToToggle(u);
                            setIsConfirmOpen(true);
                          }}
                          className={`btn-sm ${u.isActive ? 'btn-danger' : 'btn-primary'}`}
                        >
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => {
                            if ((u._count?.createdTickets ?? 0) > 0 || (u._count?.assignedTickets ?? 0) > 0 || (u._count?.comments ?? 0) > 0 || (u._count?.attachments ?? 0) > 0) {
                              const reasons: string[] = [];
                              if (u._count!.createdTickets > 0) reasons.push(`${u._count!.createdTickets} created ticket(s)`);
                              if (u._count!.assignedTickets > 0) reasons.push(`${u._count!.assignedTickets} assigned ticket(s)`);
                              if (u._count!.comments > 0) reasons.push(`${u._count!.comments} comment(s)`);
                              if (u._count!.attachments > 0) reasons.push(`${u._count!.attachments} attachment(s)`);
                              setBlockedItem({ name: getUserDisplayName(u), reasons });
                            } else {
                              setUserToDelete(u);
                              setIsDeleteConfirmOpen(true);
                            }
                          }}
                          className="btn-danger btn-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {meta && (
        <Pagination
          page={page}
          totalPages={Math.ceil(meta.total / limit) || 1}
          onPageChange={(p) => setPage(p)}
          limit={limit}
          onLimitChange={(l) => { setLimit(l); setPage(1); }}
          totalItems={meta.total}
        />
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={mode === 'create' ? 'Create User' : 'Edit User'}
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</div>
          )}
          <div>
            <label className="label">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
          <div>
            <label className="label">{mode === 'create' ? 'Password' : 'New Password (leave blank to keep current)'}</label>
            <PasswordInput
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder={mode === 'edit' ? 'Leave blank to keep current' : ''}
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
              className="input"
            >
              <option value="EndUser">End User</option>
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
        message={`Are you sure you want to ${userToToggle?.isActive ? 'deactivate' : 'activate'} ${userToToggle ? getUserDisplayName(userToToggle) : ''}?`}
        confirmLabel={userToToggle?.isActive ? 'Deactivate' : 'Activate'}
        variant={userToToggle?.isActive ? 'danger' : 'primary'}
        isLoading={isPending}
      />

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete User"
        message={`Are you sure you want to delete ${userToDelete ? getUserDisplayName(userToDelete) : ''}? This will deactivate their account.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={isPending}
      />

      <Modal isOpen={!!blockedItem} onClose={() => setBlockedItem(null)} title="Cannot Delete">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-sm text-navy-700 dark:text-blue-200">
                <strong>{blockedItem?.name}</strong> cannot be deleted because they still have:
              </p>
              <ul className="mt-2 list-disc list-inside text-sm text-navy-600 dark:text-blue-300 space-y-1">
                {blockedItem?.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
              <p className="mt-3 text-sm text-navy-500 dark:text-blue-400">
                Deactivate the user instead — their data will be preserved.
              </p>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={() => setBlockedItem(null)} className="btn-primary">OK</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
