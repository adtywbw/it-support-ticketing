import { useState, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useCreateTicket, useUploadAttachment } from '@/hooks/use-tickets';
import { useCategories } from '@/hooks/use-categories';
import { useLocations } from '@/hooks/use-locations';
import { useFileUpload } from '@/hooks/use-file-upload';
import type { TicketPriority } from '@/types';
import { formatFileSize } from '@/lib/utils';
import { MAX_TICKET_ATTACHMENT_SIZE } from '@/lib/constants';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import TicketSolutionSuggestions from '@/components/tickets/TicketSolutionSuggestions';

interface FormData {
  subject: string;
  description: string;
  categoryId: string;
  subCategoryId: string;
  locationId: string;
  itemCode: string;
  priority: TicketPriority | '';
}

interface FormErrors {
  subject?: string;
  description?: string;
  categoryId?: string;
  subCategoryId?: string;
  locationId?: string;
  itemCode?: string;
  priority?: string;
}

export default function CreateTicketForm() {
  const navigate = useNavigate();
  const { data: allCategories } = useCategories();
  const categories = allCategories?.filter((c) => c.isActive);
  const { data: allLocations } = useLocations();
  const locations = allLocations?.filter((l) => l.isActive);
  const createMutation = useCreateTicket();
  const uploadMutation = useUploadAttachment();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selfServiceSessionId] = useState(() => crypto.randomUUID());

  const [formData, setFormData] = useState<FormData>({
    subject: '',
    description: '',
    categoryId: '',
    subCategoryId: '',
    locationId: '',
    itemCode: '',
    priority: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const fileUpload = useFileUpload({ maxSizePerFile: MAX_TICKET_ATTACHMENT_SIZE });

  const selectedCategory = categories?.find((c) => c.id === formData.categoryId);
  const subCategories = (selectedCategory?.subCategories ?? []).filter((s) => s.isActive);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.subject.trim()) newErrors.subject = 'Subject is required';
    else if (formData.subject.trim().length < 5) newErrors.subject = 'Subject must be at least 5 characters';

    if (!formData.description.trim()) newErrors.description = 'Description is required';
    else if (formData.description.trim().length < 10) newErrors.description = 'Description must be at least 10 characters';

    if (!formData.categoryId) newErrors.categoryId = 'Category is required';
    if (!formData.subCategoryId) newErrors.subCategoryId = 'Sub-category is required';
    if (!formData.locationId) newErrors.locationId = 'Location is required';
    if (!formData.itemCode.trim()) newErrors.itemCode = 'Item Code is required';
    if (!formData.priority) newErrors.priority = 'Priority is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      fileUpload.addFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate() || isPending) return;

    try {
      const ticket = await createMutation.mutateAsync({
        subject: formData.subject.trim(),
        description: formData.description.trim(),
        categoryId: formData.categoryId,
        subCategoryId: formData.subCategoryId,
        locationId: formData.locationId,
        itemCode: formData.itemCode.trim() || '-',
        priority: formData.priority as TicketPriority,
        selfServiceSessionId,
      });

      const uploadErrors: string[] = [];
      const uploadResults = await Promise.allSettled(
        fileUpload.files.map((file) =>
          uploadMutation.mutateAsync({ ticketId: ticket.id, file }),
        ),
      );
      uploadResults.forEach((r, i) => {
        if (r.status === 'rejected') uploadErrors.push(fileUpload.files[i].name);
      });

      if (uploadErrors.length > 0) {
        toast.error(`Ticket created, but failed to upload: ${uploadErrors.join(', ')}`);
      }

      navigate(`/tickets/${ticket.id}`);
    } catch {
      // Error already handled by mutation's onError toast.
      // mutateAsync re-throws after onError fires, so we catch here
      // to prevent an unhandled promise rejection.
    }
  };

  const isPending = createMutation.isPending || uploadMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {fileUpload.errors.length > 0 && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {fileUpload.errors[0]}
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
            Sub-category
          </label>
          <select
            id="subCategory"
            value={formData.subCategoryId}
            onChange={(e) =>
              setFormData({ ...formData, subCategoryId: e.target.value })
            }
            className={`input ${errors.subCategoryId ? 'border-red-500' : ''}`}
            disabled={!formData.categoryId || subCategories.length === 0}
          >
            <option value="">Select sub-category</option>
            {subCategories.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
          {errors.subCategoryId && <p className="mt-1 text-xs text-red-600">{errors.subCategoryId}</p>}
        </div>
      </div>

      <TicketSolutionSuggestions
        sessionId={selfServiceSessionId}
        subCategoryId={formData.subCategoryId || undefined}
        subject={formData.subject}
      />

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

        <div>
          <label htmlFor="location" className="label">
            Location
          </label>
          <select
            id="location"
            value={formData.locationId}
            onChange={(e) =>
              setFormData({ ...formData, locationId: e.target.value })
            }
            className={`input ${errors.locationId ? 'border-red-500' : ''}`}
          >
            <option value="">Select location</option>
            {locations?.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
          {errors.locationId && <p className="mt-1 text-xs text-red-600">{errors.locationId}</p>}
        </div>

        <div>
          <label htmlFor="itemCode" className="label">
            Item Code
          </label>
          <input
            id="itemCode"
            type="text"
            value={formData.itemCode}
            onChange={(e) => setFormData({ ...formData, itemCode: e.target.value })}
            className={`input ${errors.itemCode ? 'border-red-500' : ''}`}
            placeholder="Enter item code"
          />
          <p className="mt-1 text-xs text-navy-500 dark:text-blue-400">Jika tidak ada kode barang, isi "-"</p>
          {errors.itemCode && <p className="mt-1 text-xs text-red-600">{errors.itemCode}</p>}
        </div>
      </div>

      <div>
        <label className="label">Attachments (optional, max 3 files, 5 MB each)</label>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary btn-sm"
            disabled={fileUpload.isOverLimit}
          >
            {fileUpload.isOverLimit ? 'Max 3 files' : 'Choose Files'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          {fileUpload.files.length > 0 && (
            <div className="space-y-1">
              {fileUpload.files.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center justify-between rounded-lg border border-blue-100 bg-white px-3 py-2 dark:border-navy-800 dark:bg-navy-900"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="h-5 w-5 shrink-0 text-navy-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                    <span className="text-sm text-navy-700 truncate dark:text-blue-200">{file.name}</span>
                    <span className="text-xs text-navy-500">{formatFileSize(file.size)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileUpload.removeFile(i)}
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
