import { useState, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateTicket, useUploadAttachment } from '@/hooks/use-tickets';
import { useCategories } from '@/hooks/use-categories';
import type { TicketPriority } from '@/types';
import { formatFileSize, getErrorMessage } from '@/lib/utils';
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
  const uploadMutation = useUploadAttachment();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<FormData>({
    subject: '',
    description: '',
    categoryId: '',
    subCategoryId: '',
    priority: '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const oversized = selected.find((f) => f.size > MAX_FILE_SIZE);
    if (oversized) {
      setUploadError(`File "${oversized.name}" exceeds the 5 MB limit`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFiles((prev) => [...prev, ...selected].slice(0, 3));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setUploadError(null);

    try {
      const ticket = await createMutation.mutateAsync({
        subject: formData.subject.trim(),
        description: formData.description.trim(),
        categoryId: formData.categoryId,
        subCategoryId: formData.subCategoryId || undefined,
        priority: formData.priority as TicketPriority,
      });

      for (const file of files) {
        await uploadMutation.mutateAsync({ ticketId: ticket.id, file });
      }

      navigate('/tickets');
    } catch (err) {
      setUploadError(getErrorMessage(err, 'Failed to create ticket'));
    }
  };

  const isPending = createMutation.isPending || uploadMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {(uploadError) && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {uploadError}
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

      <div>
        <label className="label">Attachments (optional, max 3 files, 5 MB each)</label>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary btn-sm"
            disabled={files.length >= 3}
          >
            {files.length >= 3 ? 'Max 3 files' : 'Choose Files'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          {files.length > 0 && (
            <div className="space-y-1">
              {files.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                    <span className="text-sm text-gray-700 truncate dark:text-gray-300">{file.name}</span>
                    <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-sm text-red-600 hover:text-red-800 shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4">
        <button type="button" onClick={() => navigate('/tickets')} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? (
            <span className="flex items-center gap-2">
              <LoadingSpinner size="sm" /> {createMutation.isPending ? 'Creating...' : 'Uploading...'}
            </span>
          ) : (
            'Create Ticket'
          )}
        </button>
      </div>
    </form>
  );
}
