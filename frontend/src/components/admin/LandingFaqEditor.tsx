import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import type { FaqEntry } from '@/types';
import { useUpdateLandingPageContent } from '@/hooks/use-update-landing-page';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface LandingFaqEditorProps {
  faqs: FaqEntry[];
}

export default function LandingFaqEditor({ faqs }: LandingFaqEditorProps) {
  const [entries, setEntries] = useState<FaqEntry[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const mutation = useUpdateLandingPageContent();

  useEffect(() => {
    // Only sync from server when there are no unsaved local changes
    setEntries((prev) => {
      const isDirty = JSON.stringify(prev) !== JSON.stringify(faqs);
      return isDirty ? prev : faqs;
    });
  }, [faqs]);

  const isDirty = JSON.stringify(entries) !== JSON.stringify(faqs);

  const handleAdd = () => {
    const newEntry: FaqEntry = {
      id: crypto.randomUUID(),
      question: '',
      answer: '',
      order: Math.max(...entries.map((e) => e.order), -1) + 1,
      active: true,
    };
    setEntries((prev) => [...prev, newEntry]);
  };

  const handleDelete = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setDeleteId(null);
  };

  const handleFieldChange = (id: string, field: keyof FaqEntry, value: string | boolean) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    );
  };

  const handleMove = (id: string, direction: 'up' | 'down') => {
    setEntries((prev) => {
      const index = prev.findIndex((e) => e.id === id);
      if (index === -1) return prev;
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= prev.length) return prev;
      const updated = [...prev];
      const tempOrder = updated[index].order;
      updated[index] = { ...updated[index], order: updated[swapIndex].order };
      updated[swapIndex] = { ...updated[swapIndex], order: tempOrder };
      return updated.sort((a, b) => a.order - b.order);
    });
  };

  const handleSave = async () => {
    try {
      await mutation.mutateAsync({
        faqs: entries.map(({ id, question, answer, order, active }) => ({
          id,
          question,
          answer,
          order,
          active,
        })),
      });
      toast.success('FAQs saved');
    } catch {
      // toast.error handled by mutation onError
    }
  };

  return (
    <div className="card p-6 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">FAQ Management</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Add, edit, reorder, and toggle FAQs shown on the landing page.
          </p>
        </div>
        <button onClick={handleAdd} className="btn-secondary">
          Add FAQ
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">No FAQs yet. Click &ldquo;Add FAQ&rdquo; to create one.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {entries.map((entry, index) => (
            <div
              key={entry.id}
              className={`rounded-lg border p-4 dark:border-gray-700 ${
                entry.active ? 'border-gray-200' : 'border-gray-200 bg-gray-50 dark:bg-gray-900/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleMove(entry.id, 'up')}
                    disabled={index === 0}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 dark:hover:bg-gray-700"
                    title="Move up"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleMove(entry.id, 'down')}
                    disabled={index === entries.length - 1}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 dark:hover:bg-gray-700"
                    title="Move down"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 space-y-3">
                  <input
                    type="text"
                    value={entry.question}
                    onChange={(e) => handleFieldChange(entry.id, 'question', e.target.value)}
                    className="input"
                    placeholder="Question"
                  />
                  <textarea
                    value={entry.answer}
                    onChange={(e) => handleFieldChange(entry.id, 'answer', e.target.value)}
                    className="input min-h-[80px]"
                    placeholder="Answer"
                  />
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={entry.active}
                        onChange={(e) => handleFieldChange(entry.id, 'active', e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      Active
                    </label>
                    <button
                      onClick={() => setDeleteId(entry.id)}
                      className="text-sm text-red-600 hover:underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={!isDirty || mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending ? 'Saving...' : 'Save All FAQs'}
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="Delete FAQ"
        message="Are you sure you want to delete this FAQ? This will be saved when you click 'Save All FAQs'."
        confirmLabel="Delete"
      />
    </div>
  );
}
