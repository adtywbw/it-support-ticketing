import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/lib/axios';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type {
  Category,
  SubCategory,
  CreateCategoryPayload,
  UpdateCategoryPayload,
  CreateSubCategoryPayload,
  UpdateSubCategoryPayload,
} from '@/types';

type Tab = 'categories' | 'subcategories';

export default function MasterDataManagement() {
  const [activeTab, setActiveTab] = useState<Tab>('categories');

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('categories')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'categories'
                ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Categories
          </button>
          <button
            onClick={() => setActiveTab('subcategories')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'subcategories'
                ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Sub-categories
          </button>
        </nav>
      </div>

      {activeTab === 'categories' ? <CategoryManager /> : <SubCategoryManager />}
    </div>
  );
}

function CategoryManager() {
  const queryClient = useQueryClient();
  const { data: categories, isLoading, isError, error, refetch } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await apiClient.get('/categories');
      return response.data;
    },
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Category | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (payload: CreateCategoryPayload) => {
      await apiClient.post('/categories', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['subcategories'] });
      setIsModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create category';
      toast.error(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateCategoryPayload }) => {
      await apiClient.patch(`/categories/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['subcategories'] });
      setIsModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update category';
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['subcategories'] });
      setIsDeleteOpen(false);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to delete category';
      toast.error(msg);
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

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  if (isLoading) return <div className="card p-12"><LoadingSpinner size="lg" /></div>;
  if (isError) return <ErrorMessage message={(error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load'} onRetry={() => refetch()} />;

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
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{cat.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{cat.description || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cat.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                      {cat.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm">
                    <button onClick={() => openEdit(cat)} className="text-primary-600 hover:text-primary-800 mr-3 dark:text-primary-400 dark:hover:text-primary-300">Edit</button>
                    <button
                      onClick={() => { setDeletingId(cat.id); setIsDeleteOpen(true); }}
                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
}

function SubCategoryManager() {
  const queryClient = useQueryClient();
  const { data: categories } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await apiClient.get('/categories');
      return response.data;
    },
  });

  const { data: subCategories, isLoading, isError, error, refetch } = useQuery<SubCategory[]>({
    queryKey: ['subcategories'],
    queryFn: async () => {
      const allSubs: SubCategory[] = [];
      if (categories) {
        for (const cat of categories) {
          const res = await apiClient.get(`/categories/${cat.id}/sub-categories`);
          allSubs.push(...res.data);
        }
      }
      return allSubs;
    },
    enabled: !!categories,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SubCategory | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCategoryId, setFormCategoryId] = useState<string>('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<{ id: string; categoryId: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: async (payload: CreateSubCategoryPayload) => {
      await apiClient.post(`/categories/${payload.categoryId}/sub-categories`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subcategories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create sub-category';
      toast.error(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, categoryId, payload }: { id: string; categoryId: string; payload: UpdateSubCategoryPayload }) => {
      await apiClient.patch(`/categories/${categoryId}/sub-categories/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subcategories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update sub-category';
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, categoryId }: { id: string; categoryId: string }) => {
      await apiClient.delete(`/categories/${categoryId}/sub-categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subcategories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsDeleteOpen(false);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to delete sub-category';
      toast.error(msg);
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

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const getCategoryName = (id: string) => categories?.find((c) => c.id === id)?.name || 'Unknown';

  if (isLoading) return <div className="card p-12"><LoadingSpinner size="lg" /></div>;
  if (isError) return <ErrorMessage message={(error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load'} onRetry={() => refetch()} />;

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
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
              {subCategories.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{sub.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{getCategoryName(sub.categoryId)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{sub.description || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${sub.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                      {sub.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm">
                    <button onClick={() => openEdit(sub)} className="text-primary-600 hover:text-primary-800 mr-3 dark:text-primary-400 dark:hover:text-primary-300">Edit</button>
                    <button onClick={() => { setDeletingItem({ id: sub.id, categoryId: sub.categoryId }); setIsDeleteOpen(true); }} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
}
