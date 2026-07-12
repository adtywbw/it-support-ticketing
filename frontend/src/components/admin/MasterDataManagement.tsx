import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Switch from '@/components/ui/Switch';
import { getErrorMessage } from '@/lib/utils';
import { useCategories } from '@/hooks/use-categories';
import SLAConfigManager from '@/components/admin/SLAConfigManager';
import FaqManager from '@/components/admin/FaqManager';
import type {
  Category,
  SubCategory,
  Location,
  CreateCategoryPayload,
  UpdateCategoryPayload,
  CreateSubCategoryPayload,
  UpdateSubCategoryPayload,
  CreateLocationPayload,
  UpdateLocationPayload,
} from '@/types';

type Tab = 'categories' | 'subcategories' | 'sla' | 'faq' | 'locations';

export default function MasterDataManagement() {
  const [activeTab, setActiveTab] = useState<Tab>('categories');

  return (
    <div className="space-y-4">
      <div className="border-b border-blue-100 dark:border-navy-800">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('categories')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'categories'
                ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                : 'border-transparent text-navy-500 hover:text-navy-700 dark:text-blue-300 dark:hover:text-blue-200'
            }`}
          >
            Categories
          </button>
          <button
            onClick={() => setActiveTab('subcategories')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'subcategories'
                ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                : 'border-transparent text-navy-500 hover:text-navy-700 dark:text-blue-300 dark:hover:text-blue-200'
            }`}
          >
            Sub-categories
          </button>
          <button
            onClick={() => setActiveTab('sla')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'sla'
                ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                : 'border-transparent text-navy-500 hover:text-navy-700 dark:text-blue-300 dark:hover:text-blue-200'
            }`}
          >
            SLA Configuration
          </button>
          <button
            onClick={() => setActiveTab('faq')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'faq'
                ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                : 'border-transparent text-navy-500 hover:text-navy-700 dark:text-blue-300 dark:hover:text-blue-200'
            }`}
          >
            FAQ
          </button>
          <button
            onClick={() => setActiveTab('locations')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'locations'
                ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                : 'border-transparent text-navy-500 hover:text-navy-700 dark:text-blue-300 dark:hover:text-blue-200'
            }`}
          >
            Locations
          </button>
        </nav>
      </div>

      {activeTab === 'categories' && <CategoryManager />}
      {activeTab === 'subcategories' && <SubCategoryManager />}
      {activeTab === 'sla' && <SLAConfigManager />}
      {activeTab === 'faq' && <FaqManager />}
      {activeTab === 'locations' && <LocationManager />}
    </div>
  );
}

function CategoryManager() {
  const queryClient = useQueryClient();
  const { data: categories, isLoading, isError, error, refetch } = useCategories();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Category | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [blockedItem, setBlockedItem] = useState<{ name: string; reasons: string[] } | null>(null);

  const createMutation = useMutation({
    mutationFn: async (payload: CreateCategoryPayload) => {
      await apiClient.post('/categories', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = getErrorMessage(err, 'Failed to create category');
      toast.error(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateCategoryPayload }) => {
      await apiClient.patch(`/categories/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = getErrorMessage(err, 'Failed to update category');
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsDeleteOpen(false);
    },
    onError: (err: unknown) => {
      const msg = getErrorMessage(err, 'Failed to delete category');
      toast.error(msg);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiClient.patch(`/categories/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, 'Failed to toggle status'));
    },
  });

  const openCreate = () => {
    setEditingItem(null);
    setFormName('');
    setFormDesc('');
    setIsModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditingItem(cat);
    setFormName(cat.name);
    setFormDesc(cat.description || '');
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (editingItem) {
      updateMutation.mutate({
        id: editingItem.id,
        payload: {
          name: formName,
          description: formDesc || undefined,
        },
      });
    } else {
      createMutation.mutate({
        name: formName,
        description: formDesc || undefined,
      });
    }
  };

  const handleDeleteClick = (cat: Category) => {
    const reasons: string[] = [];
    if ((cat._count?.tickets ?? 0) > 0) reasons.push(`${cat._count!.tickets} ticket(s)`);
    if ((cat._count?.subCategories ?? 0) > 0) reasons.push(`${cat._count!.subCategories} sub-categor(ies)`);
    if ((cat._count?.slaConfigs ?? 0) > 0) reasons.push(`${cat._count!.slaConfigs} SLA config(s)`);

    if (reasons.length > 0) {
      setBlockedItem({ name: cat.name, reasons });
    } else {
      setDeletingId(cat.id);
      setIsDeleteOpen(true);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending || toggleMutation.isPending;

  if (isLoading) return <div className="card p-12"><LoadingSpinner size="lg" /></div>;
  if (isError) return <ErrorMessage message={getErrorMessage(error, 'Failed to load')} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openCreate} className="btn-primary">Add Category</button>
      </div>

      {!categories || categories.length === 0 ? (
        <div className="card">
          <EmptyState title="No categories" description="Create your first category." action={<button onClick={openCreate} className="btn-primary">Add Category</button>} />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-blue-100 dark:divide-navy-800">
              <thead className="bg-blue-50 dark:bg-navy-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Active</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-blue-100 dark:bg-navy-900 dark:divide-navy-800">
                {categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-blue-50 dark:hover:bg-navy-800/60">
                    <td className="px-6 py-4 text-sm font-medium text-navy-950 dark:text-blue-50">{cat.name}</td>
                    <td className="px-6 py-4 text-sm text-navy-500 dark:text-blue-300">{cat.description || '-'}</td>
                    <td className="px-6 py-4">
                      <Switch checked={cat.isActive} onChange={() => toggleMutation.mutate({ id: cat.id, isActive: !cat.isActive })} disabled={toggleMutation.isPending} label={"Toggle " + cat.name} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(cat)} className="btn-secondary btn-sm">Edit</button>
                        <button onClick={() => handleDeleteClick(cat)} className="btn-danger btn-sm">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? 'Edit Category' : 'Add Category'}>
        <div className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={3} className="input resize-y" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} className="btn-primary" disabled={isPending}>{isPending ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={() => deletingId && deleteMutation.mutate(deletingId)}
        title="Delete Category"
        message="Are you sure you want to delete this category? This action cannot be undone."
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
                <strong>{blockedItem?.name}</strong> cannot be deleted because it is still in use by:
              </p>
              <ul className="mt-2 list-disc list-inside text-sm text-navy-600 dark:text-blue-300 space-y-1">
                {blockedItem?.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
              <p className="mt-3 text-sm text-navy-500 dark:text-blue-400">
                You can deactivate it instead — existing records will still work.
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

export function SubCategoryManager() {
  const queryClient = useQueryClient();
  const { data: categories, isLoading, isError, error, refetch } = useCategories();

  const subCategories: SubCategory[] = (categories ?? []).flatMap(
    (cat) => (cat.subCategories ?? []).map((sub) => ({ ...sub, categoryId: cat.id }))
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SubCategory | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCategoryId, setFormCategoryId] = useState<string>('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<{ id: string; categoryId: string } | null>(null);
  const [blockedItem, setBlockedItem] = useState<{ name: string; reasons: string[] } | null>(null);

  const createMutation = useMutation({
    mutationFn: async (payload: CreateSubCategoryPayload) => {
      await apiClient.post(`/categories/${payload.categoryId}/sub-categories`, { name: payload.name, description: payload.description });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = getErrorMessage(err, 'Failed to create sub-category');
      toast.error(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, categoryId, payload }: { id: string; categoryId: string; payload: UpdateSubCategoryPayload }) => {
      await apiClient.patch(`/categories/${categoryId}/sub-categories/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = getErrorMessage(err, 'Failed to update sub-category');
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, categoryId }: { id: string; categoryId: string }) => {
      await apiClient.delete(`/categories/${categoryId}/sub-categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsDeleteOpen(false);
    },
    onError: (err: unknown) => {
      const msg = getErrorMessage(err, 'Failed to delete sub-category');
      toast.error(msg);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, categoryId, isActive }: { id: string; categoryId: string; isActive: boolean }) => {
      await apiClient.patch(`/categories/${categoryId}/sub-categories/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, 'Failed to toggle status'));
    },
  });

  const openCreate = () => {
    setEditingItem(null);
    setFormName('');
    setFormDesc('');
    setFormCategoryId('');
    setIsModalOpen(true);
  };

  const openEdit = (sub: SubCategory) => {
    setEditingItem(sub);
    setFormName(sub.name);
    setFormDesc(sub.description || '');
    setFormCategoryId(sub.categoryId);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (editingItem) {
      updateMutation.mutate({
        id: editingItem.id,
        categoryId: editingItem.categoryId,
        payload: { name: formName, description: formDesc || undefined, isActive: editingItem.isActive },
      });
    } else if (formCategoryId) {
      createMutation.mutate({
        name: formName,
        description: formDesc || undefined,
        categoryId: formCategoryId,
      });
    }
  };

  const handleDeleteClick = (sub: SubCategory & { categoryId: string }) => {
    const reasons: string[] = [];
    if ((sub._count?.tickets ?? 0) > 0) reasons.push(`${sub._count!.tickets} ticket(s)`);
    if ((sub._count?.faqs ?? 0) > 0) reasons.push(`${sub._count!.faqs} FAQ(s)`);
    if (reasons.length > 0) {
      setBlockedItem({ name: sub.name, reasons });
    } else {
      setDeletingItem({ id: sub.id, categoryId: sub.categoryId });
      setIsDeleteOpen(true);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending || toggleMutation.isPending;
  const getCategoryName = (id: string) => categories?.find((c) => c.id === id)?.name || 'Unknown';

  if (isLoading) return <div className="card p-12"><LoadingSpinner size="lg" /></div>;
  if (isError) return <ErrorMessage message={getErrorMessage(error, 'Failed to load')} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openCreate} className="btn-primary">Add Sub-category</button>
      </div>

      {!subCategories || subCategories.length === 0 ? (
        <div className="card">
          <EmptyState title="No sub-categories" description="Create your first sub-category." action={<button onClick={openCreate} className="btn-primary">Add Sub-category</button>} />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-blue-100 dark:divide-navy-800">
              <thead className="bg-blue-50 dark:bg-navy-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Active</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-blue-100 dark:bg-navy-900 dark:divide-navy-800">
                {subCategories.map((sub) => (
                  <tr key={sub.id} className="hover:bg-blue-50 dark:hover:bg-navy-800/60">
                    <td className="px-6 py-4 text-sm font-medium text-navy-950 dark:text-blue-50">{sub.name}</td>
                    <td className="px-6 py-4 text-sm text-navy-500 dark:text-blue-300">{getCategoryName(sub.categoryId)}</td>
                    <td className="px-6 py-4 text-sm text-navy-500 dark:text-blue-300">{sub.description || '-'}</td>
                    <td className="px-6 py-4">
                      <Switch checked={sub.isActive} onChange={() => toggleMutation.mutate({ id: sub.id, categoryId: sub.categoryId, isActive: !sub.isActive })} disabled={toggleMutation.isPending} label={"Toggle " + sub.name} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(sub)} className="btn-secondary btn-sm">Edit</button>
                        <button onClick={() => handleDeleteClick(sub)} className="btn-danger btn-sm">Delete</button>                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? 'Edit Sub-category' : 'Add Sub-category'}>
        <div className="space-y-4">
          {!editingItem && (
            <div>
              <label className="label">Category</label>
              <select value={formCategoryId} onChange={(e) => setFormCategoryId(e.target.value)} className="input">
                <option value="">Select category</option>
                {categories?.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label">Name</label>
            <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={3} className="input resize-y" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} className="btn-primary" disabled={isPending}>{isPending ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={() => deletingItem && deleteMutation.mutate(deletingItem)}
        title="Delete Sub-category"
        message="Are you sure you want to delete this sub-category?"
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
                <strong>{blockedItem?.name}</strong> cannot be deleted because it is still in use by:
              </p>
              <ul className="mt-2 list-disc list-inside text-sm text-navy-600 dark:text-blue-300 space-y-1">
                {blockedItem?.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
              <p className="mt-3 text-sm text-navy-500 dark:text-blue-400">
                You can deactivate it instead — existing records will still work.
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

function LocationManager() {
  const queryClient = useQueryClient();
  const { data: locations, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Location[]>>('/locations');
      return unwrapData(response) as Location[];
    },
    staleTime: 1000 * 60 * 30,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Location | null>(null);
  const [formName, setFormName] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [blockedItem, setBlockedItem] = useState<{ name: string; reasons: string[] } | null>(null);

  const createMutation = useMutation({
    mutationFn: async (payload: CreateLocationPayload) => {
      await apiClient.post('/locations', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setIsModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = getErrorMessage(err, 'Failed to create location');
      toast.error(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateLocationPayload }) => {
      await apiClient.patch(`/locations/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setIsModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = getErrorMessage(err, 'Failed to update location');
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/locations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setIsDeleteOpen(false);
    },
    onError: (err: unknown) => {
      const msg = getErrorMessage(err, 'Failed to delete location');
      toast.error(msg);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiClient.patch(`/locations/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, 'Failed to toggle status'));
    },
  });

  const openCreate = () => {
    setEditingItem(null);
    setFormName('');
    setIsModalOpen(true);
  };

  const openEdit = (loc: Location) => {
    setEditingItem(loc);
    setFormName(loc.name);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (editingItem) {
      updateMutation.mutate({
        id: editingItem.id,
        payload: { name: formName },
      });
    } else {
      createMutation.mutate({ name: formName });
    }
  };

  const handleDeleteClick = (loc: Location) => {
    if ((loc._count?.tickets ?? 0) > 0) {
      setBlockedItem({ name: loc.name, reasons: [`${loc._count!.tickets} ticket(s)`] });
    } else {
      setDeletingId(loc.id);
      setIsDeleteOpen(true);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending || toggleMutation.isPending;

  if (isLoading) return <div className="card p-12"><LoadingSpinner size="lg" /></div>;
  if (isError) return <ErrorMessage message={getErrorMessage(error, 'Failed to load')} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openCreate} className="btn-primary">Add Location</button>
      </div>

      {!locations || locations.length === 0 ? (
        <div className="card">
          <EmptyState title="No locations" description="Create your first location." action={<button onClick={openCreate} className="btn-primary">Add Location</button>} />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-blue-100 dark:divide-navy-800">
              <thead className="bg-blue-50 dark:bg-navy-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Active</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-blue-100 dark:bg-navy-900 dark:divide-navy-800">
                {locations.map((loc) => (
                  <tr key={loc.id} className="hover:bg-blue-50 dark:hover:bg-navy-800/60">
                    <td className="px-6 py-4 text-sm font-medium text-navy-950 dark:text-blue-50">{loc.name}</td>
                    <td className="px-6 py-4">
                      <Switch checked={loc.isActive} onChange={() => toggleMutation.mutate({ id: loc.id, isActive: !loc.isActive })} disabled={toggleMutation.isPending} label={"Toggle " + loc.name} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(loc)} className="btn-secondary btn-sm">Edit</button>
                        <button onClick={() => handleDeleteClick(loc)} className="btn-danger btn-sm">Delete</button>                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? 'Edit Location' : 'Add Location'}>
        <div className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="input" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} className="btn-primary" disabled={isPending}>{isPending ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={() => deletingId && deleteMutation.mutate(deletingId)}
        title="Delete Location"
        message="Are you sure you want to delete this location? This action cannot be undone."
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
                <strong>{blockedItem?.name}</strong> cannot be deleted because it is still in use by:
              </p>
              <ul className="mt-2 list-disc list-inside text-sm text-navy-600 dark:text-blue-300 space-y-1">
                {blockedItem?.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
              <p className="mt-3 text-sm text-navy-500 dark:text-blue-400">
                You can deactivate it instead — existing records will still work.
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
