import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateTicket } from '@/hooks/use-tickets';
import { useCategories } from '@/hooks/use-categories';
import type { TicketPriority } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface FormData {
  subject: string;
  description: string;
  categoryId: string;
  subCategoryId: string;
  priority: TicketPriority | '';
}

interface FormErrors {
  subject?: string;
  description?: string;
  categoryId?: string;
  priority?: string;
}

export default function CreateTicketForm() {
  const navigate = useNavigate();
  const { data: categories } = useCategories();
  const createMutation = useCreateTicket();

  const [formData, setFormData] = useState<FormData>({
    subject: '',
    description: '',
    categoryId: '',
    subCategoryId: '',
    priority: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const selectedCategory = categories?.find((c) => c.id === formData.categoryId);
  const subCategories = selectedCategory?.subCategories ?? [];

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.subject.trim()) newErrors.subject = 'Subject is required';
    else if (formData.subject.trim().length < 5) newErrors.subject = 'Subject must be at least 5 characters';

    if (!formData.description.trim()) newErrors.description = 'Description is required';
    else if (formData.description.trim().length < 10) newErrors.description = 'Description must be at least 10 characters';

    if (!formData.categoryId) newErrors.categoryId = 'Category is required';
    if (!formData.priority) newErrors.priority = 'Priority is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    createMutation.mutate(
      {
        subject: formData.subject.trim(),
        description: formData.description.trim(),
        categoryId: formData.categoryId,
        subCategoryId: formData.subCategoryId || undefined,
        priority: formData.priority as TicketPriority,
      },
      {
        onSuccess: () => {
          navigate('/tickets');
        },
      },
    );
  };

  const errorMessage = createMutation.error
    ? (createMutation.error as { response?: { data?: { message?: string } } })?.response?.data
        ?.message || 'Failed to create ticket'
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errorMessage && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {errorMessage}
        </div>
      )}

      <div>
        <label htmlFor="subject" className="label">
          Subject
        </label>
        <input
          id="subject"
          type="text"
          value={formData.subject}
          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
          className={`input ${errors.subject ? 'border-red-500' : ''}`}
          placeholder="Brief summary of the issue"
        />
        {errors.subject && <p className="mt-1 text-xs text-red-600">{errors.subject}</p>}
      </div>

      <div>
        <label htmlFor="description" className="label">
          Description
        </label>
        <textarea
          id="description"
          rows={5}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className={`input resize-y ${errors.description ? 'border-red-500' : ''}`}
          placeholder="Detailed description of the issue"
        />
        {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className="label">
            Category
          </label>
          <select
            id="category"
            value={formData.categoryId}
            onChange={(e) =>
              setFormData({
                ...formData,
                categoryId: e.target.value,
                subCategoryId: '',
              })
            }
            className={`input ${errors.categoryId ? 'border-red-500' : ''}`}
          >
            <option value="">Select category</option>
            {categories?.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          {errors.categoryId && <p className="mt-1 text-xs text-red-600">{errors.categoryId}</p>}
        </div>

        <div>
          <label htmlFor="subCategory" className="label">
            Sub-category (optional)
          </label>
          <select
            id="subCategory"
            value={formData.subCategoryId}
            onChange={(e) =>
              setFormData({ ...formData, subCategoryId: e.target.value })
            }
            className="input"
            disabled={!formData.categoryId || subCategories.length === 0}
          >
            <option value="">Select sub-category</option>
            {subCategories.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="priority" className="label">
            Priority
          </label>
          <select
            id="priority"
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value as TicketPriority })}
            className={`input ${errors.priority ? 'border-red-500' : ''}`}
          >
            <option value="">Select priority</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
          {errors.priority && <p className="mt-1 text-xs text-red-600">{errors.priority}</p>}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4">
        <button type="button" onClick={() => navigate('/tickets')} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
          {createMutation.isPending ? (
            <span className="flex items-center gap-2">
              <LoadingSpinner size="sm" /> Creating...
            </span>
          ) : (
            'Create Ticket'
          )}
        </button>
      </div>
    </form>
  );
}
