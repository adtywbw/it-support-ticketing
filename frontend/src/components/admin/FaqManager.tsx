import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Switch from '@/components/ui/Switch';
import { getErrorMessage } from '@/lib/utils';
import {
  useAllFaqs,
  useCreateFaq,
  useUpdateFaq,
  useDeleteFaq,
  type CreateFaqPayload,
} from '@/hooks/use-faqs';
import { useCategories } from '@/hooks/use-categories';
import FaqAnalyticsSummary from '@/components/admin/FaqAnalyticsSummary';
import type { Faq } from '@/types';

export default function FaqManager() {
  const { data: faqs, isLoading, isError, error, refetch } = useAllFaqs();
  const createMutation = useCreateFaq();
  const updateMutation = useUpdateFaq();
  const deleteMutation = useDeleteFaq();
  const { data: categories } = useCategories();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Faq | null>(null);
  const [formQuestion, setFormQuestion] = useState('');
  const [formAnswer, setFormAnswer] = useState('');
  const [formOrder, setFormOrder] = useState(0);
  const [formActive, setFormActive] = useState(true);
  const [formSubCategoryId, setFormSubCategoryId] = useState('');
  const [formShowOnLogin, setFormShowOnLogin] = useState(true);
  const [formKeywords, setFormKeywords] = useState('');

  const parseKeywords = (value: string) => [...new Set(
    value
      .split(',')
      .map((keyword) => keyword.trim().toLowerCase().replace(/\s+/g, ' '))
      .filter(Boolean),
  )];
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openCreate = () => {
    setEditingItem(null);
    setFormQuestion('');
    setFormAnswer('');
    setFormOrder(0);
    setFormActive(true);
    setFormSubCategoryId('');
    setFormShowOnLogin(true);
    setFormKeywords('');
    setIsModalOpen(true);
  };

  const openEdit = (faq: Faq) => {
    setEditingItem(faq);
    setFormQuestion(faq.question);
    setFormAnswer(faq.answer);
    setFormOrder(faq.displayOrder);
    setFormActive(faq.isActive);
    setFormSubCategoryId(faq.subCategoryId);
    setFormShowOnLogin(faq.showOnLogin);
    setFormKeywords(faq.keywords.join(', '));
    setIsModalOpen(true);
  };

  const handleSave = () => {
    const payload: CreateFaqPayload = {
      question: formQuestion.trim(),
      answer: formAnswer.trim(),
      displayOrder: formOrder,
      isActive: formActive,
      showOnLogin: formShowOnLogin,
      subCategoryId: formSubCategoryId,
      keywords: parseKeywords(formKeywords),
    };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, payload }, { onSuccess: () => setIsModalOpen(false) });
    } else {
      createMutation.mutate(payload, { onSuccess: () => setIsModalOpen(false) });
    }
  };

  const handleToggleActive = (faq: Faq) => {
    updateMutation.mutate({ id: faq.id, payload: { isActive: !faq.isActive } });
  };

  const openDelete = (id: string) => {
    setDeletingId(id);
    setIsDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (!deletingId) return;
    deleteMutation.mutate(deletingId, { onSuccess: () => setIsDeleteOpen(false) });
  };

  const isPending =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  if (isLoading) return <div className="card p-12"><LoadingSpinner size="lg" /></div>;
  if (isError) return <ErrorMessage message={getErrorMessage(error, 'Failed to load FAQs')} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openCreate} className="btn-primary">Add FAQ</button>
      </div>

      <FaqAnalyticsSummary />

      {!faqs || faqs.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No FAQs"
            description="Create your first FAQ to display on the login page."
            action={<button onClick={openCreate} className="btn-primary">Add FAQ</button>}
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-blue-100 dark:divide-navy-800">
              <thead className="bg-blue-50 dark:bg-navy-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Question</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Order</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Active</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100 bg-white dark:divide-navy-800 dark:bg-navy-900">
                {faqs.map((faq) => (
                  <tr key={faq.id}>
                    <td className="px-6 py-4 text-sm text-navy-950 dark:text-blue-50 max-w-md truncate">{faq.question}</td>
                    <td className="px-6 py-4 text-sm text-navy-500 dark:text-blue-300">{faq.displayOrder}</td>
                    <td className="px-6 py-4">
                      <Switch checked={faq.isActive} onChange={() => handleToggleActive(faq)} disabled={isPending} label={"Toggle " + faq.question} />
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button onClick={() => openEdit(faq)} className="btn-secondary btn-sm">Edit</button>
                      <button onClick={() => openDelete(faq.id)} className="btn-danger btn-sm">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? 'Edit FAQ' : 'Add FAQ'} size="lg">
        <div className="space-y-4">
          <div>
            <label htmlFor="faq-question" className="label">Question</label>
            <input
              id="faq-question"
              type="text"
              value={formQuestion}
              onChange={(e) => setFormQuestion(e.target.value)}
              className="input"
              maxLength={255}
              placeholder="Frequently asked question"
            />
          </div>
          <div>
            <label htmlFor="faq-answer" className="label">Answer</label>
            <textarea
              id="faq-answer"
              value={formAnswer}
              onChange={(e) => setFormAnswer(e.target.value)}
              className="input min-h-[120px] resize-y"
              maxLength={5000}
              placeholder="Answer shown when the question is expanded"
            />
          </div>
          <div className="flex gap-4">
            <div>
              <label htmlFor="faq-order" className="label">Display order</label>
              <input
                id="faq-order"
                type="number"
                value={formOrder}
                onChange={(e) => setFormOrder(Number(e.target.value))}
                className="input w-32"
                min={0}
              />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <input
                id="faq-active"
                type="checkbox"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                className="h-4 w-4 rounded border-blue-200 text-primary-600 focus:ring-primary-500 dark:border-navy-800 dark:bg-navy-900"
              />
              <label htmlFor="faq-active" className="text-sm text-navy-700 dark:text-blue-200">Active (visible on login)</label>
            </div>
          </div>
          <div>
            <label htmlFor="faq-subcategory" className="label">Sub-category</label>
            <select
              id="faq-subcategory"
              value={formSubCategoryId}
              onChange={(e) => setFormSubCategoryId(e.target.value)}
              className="input"
            >
              <option value="">Select sub-category</option>
              {categories?.flatMap((cat) =>
                (cat.subCategories ?? []).map((sub) => (
                  <option key={sub.id} value={sub.id}>{cat.name} &gt; {sub.name}</option>
                )),
              )}
            </select>
          </div>
          <div className="flex items-end gap-2 pb-1">
            <input
              id="faq-show-on-login"
              type="checkbox"
              checked={formShowOnLogin}
              onChange={(e) => setFormShowOnLogin(e.target.checked)}
              className="h-4 w-4 rounded border-blue-200 text-primary-600 focus:ring-primary-500 dark:border-navy-800 dark:bg-navy-900"
            />
            <label htmlFor="faq-show-on-login" className="text-sm text-navy-700 dark:text-blue-200">Show on login page</label>
          </div>
          <div>
            <label htmlFor="faq-keywords" className="label">Keywords</label>
            <input
              id="faq-keywords"
              type="text"
              value={formKeywords}
              onChange={(e) => setFormKeywords(e.target.value)}
              className="input"
              placeholder="Separate keywords with commas"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setIsModalOpen(false)} className="btn-secondary" disabled={isPending}>Cancel</button>
            <button
              onClick={handleSave}
              className="btn-primary"
              disabled={isPending || !formQuestion.trim() || !formAnswer.trim()}
            >
              {isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={confirmDelete}
        title="Delete FAQ"
        message="Are you sure you want to delete this FAQ? This action cannot be undone."
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
