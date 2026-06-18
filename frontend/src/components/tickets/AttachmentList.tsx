import { useRef, useState } from 'react';
import { useTicketAttachments, useUploadAttachment } from '@/hooks/use-tickets';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { formatDate, formatFileSize } from '@/lib/utils';

interface AttachmentListProps {
  ticketId: number;
}

export default function AttachmentList({ ticketId }: AttachmentListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { data: attachments, isLoading, isError } = useTicketAttachments(ticketId);
  const uploadMutation = useUploadAttachment();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      await uploadMutation.mutateAsync({ ticketId, file });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn-secondary btn-sm"
          disabled={uploading}
        >
          {uploading ? 'Uploading...' : 'Upload File'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {isLoading && <LoadingSpinner />}

      {isError && <p className="text-sm text-red-600">Failed to load attachments.</p>}

      {!isLoading && !isError && (!attachments || attachments.length === 0) && (
        <EmptyState title="No attachments" description="Upload files to attach to this ticket." />
      )}

      {attachments && attachments.length > 0 && (
        <div className="space-y-2">
          {(attachments as {
            id: number;
            fileName: string;
            fileSize: number;
            mimeType: string;
            uploadedBy?: { firstName: string; lastName: string };
            createdAt: string;
          }[]).map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <svg className="h-8 w-8 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{attachment.fileName}</p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(attachment.fileSize)} &middot;{' '}
                    {attachment.uploadedBy
                      ? `${attachment.uploadedBy.firstName} ${attachment.uploadedBy.lastName}`
                      : 'Unknown'}{' '}
                    &middot; {formatDate(attachment.createdAt)}
                  </p>
                </div>
              </div>
              <a
                href={`/api/tickets/${ticketId}/attachments/${attachment.id}`}
                className="btn-secondary btn-sm shrink-0"
                download
              >
                Download
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
