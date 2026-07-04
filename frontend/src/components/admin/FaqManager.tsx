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
import type { Faq } from '@/types';

export default function FaqManager() {
  const { data: faqs, isLoading, isError, error, refetch } = useAllFaqs();
  const createMutation = useCreateFaq();
  const updateMutation = useUpdateFaq();
  const deleteMutation = useDeleteFaq();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Faq | null>(null);
  const [formQuestion, setFormQuestion] = useState('');
  const [formAnswer, setFormAnswer] = useState('');
  const [formOrder, setFormOrder] = useState(0);
  const [formActive, setFormActive] = useState(true);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openCreate = () => {
    setEditingItem(null);
    setFormQuestion('');
    setFormAnswer('');
    setFormOrder(0);
    setFormActive(true);
    setIsModalOpen(true);
  };

  const openEdit = (faq: Faq) => {
    setEditingItem(faq);
    setFormQuestion(faq.question);
    setFormAnswer(faq.answer);
    setFormOrder(faq.displayOrder);
    setFormActive(faq.isActive);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    const payload: CreateFaqPayload = {
      question: formQuestion.trim(),
      answer: formAnswer.trim(),
      displayOrder: formOrder,
      isActive: formActive,
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
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase dark:text-slate-400">Question</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase dark:text-slate-400">Order</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase dark:text-slate-400">Active</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
              {faqs.map((faq) => (
                <tr key={faq.id}>
                  <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100 max-w-md truncate">{faq.question}</td>
                  <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{faq.displayOrder}</td>
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
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800"
              />
              <label htmlFor="faq-active" className="text-sm text-slate-700 dark:text-slate-300">Active (visible on login)</label>
            </div>
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
