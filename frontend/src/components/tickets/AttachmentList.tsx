import { useRef, useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useTicketAttachments, useUploadAttachment } from '@/hooks/use-tickets';
import { useAuthStore } from '@/stores/auth-store';
import apiClient from '@/lib/axios';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import { formatDate, formatFileSize, getErrorMessage, getUserDisplayName } from '@/lib/utils';
import { ALLOWED_MIME_TYPES, MAX_DIRECT_ATTACHMENT_SIZE } from '@/lib/constants';

const thumbnailCache = new Map<string, string>();
const MAX_THUMBNAILS = 100;

function cacheThumbnail(id: string, url: string) {
  const existing = thumbnailCache.get(id);
  if (existing) URL.revokeObjectURL(existing);
  thumbnailCache.set(id, url);
  if (thumbnailCache.size <= MAX_THUMBNAILS) return;
  const [oldestId, oldestUrl] = thumbnailCache.entries().next().value as [string, string];
  URL.revokeObjectURL(oldestUrl);
  thumbnailCache.delete(oldestId);
}

function Thumbnail({ id, alt, onClick }: { id: string; alt: string; onClick: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(() => thumbnailCache.get(id) ?? null);
  const imgRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (blobUrl !== null || fetchedRef.current) return;
    const el = imgRef.current;
    if (!el) return;
    const ctrl = new AbortController();
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        fetchedRef.current = true;
        apiClient.get(`/attachments/${id}/download?view=1`, { responseType: 'blob', signal: ctrl.signal })
          .then((r) => {
            const u = URL.createObjectURL(r.data);
            cacheThumbnail(id, u);
            setBlobUrl(u);
          })
          .catch(() => { if (!ctrl.signal.aborted) setBlobUrl(''); });
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      ctrl.abort();
    };
  }, [id, blobUrl]);

  if (blobUrl === '') return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-blue-50 text-primary-400 dark:bg-navy-800 dark:text-blue-300">
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
      </svg>
    </div>
  );
  if (blobUrl !== null) return <img src={blobUrl} alt={alt} className="h-10 w-10 shrink-0 rounded object-cover cursor-pointer" onClick={onClick} />;
  return <div ref={imgRef} className="h-10 w-10 shrink-0 rounded bg-blue-100 animate-pulse dark:bg-navy-700" />;
}

interface AttachmentListProps {
  ticketId: string;
}

export default function AttachmentList({ ticketId }: AttachmentListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const user = useAuthStore((s) => s.user);
  const isStaff = user && (user.role === 'ITSupport' || user.role === 'Admin');
  const [uploading, setUploading] = useState(false);
  const [uploadVisibility, setUploadVisibility] = useState<'PUBLIC' | 'INTERNAL'>('PUBLIC');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');
  const previewUrlRef = useRef<string | null>(null);
  const [attachPage, setAttachPage] = useState(1);
  const [attachLimit, setAttachLimit] = useState(20);
  const { data: attachmentsData, isLoading, isError } = useTicketAttachments(ticketId, attachPage, attachLimit);
  const attachments = attachmentsData?.data ?? [];
  const attachMeta = attachmentsData?.meta;
  const uploadMutation = useUploadAttachment();

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error(`File type ${file.type || 'unknown'} is not allowed`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_DIRECT_ATTACHMENT_SIZE) {
      toast.error('File size exceeds 10 MB limit');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      await uploadMutation.mutateAsync({ ticketId, file, visibility: uploadVisibility });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to upload attachment'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openPreview = useCallback(async (attachment: { id: string; originalName: string }) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewId(attachment.id);
    setPreviewName(attachment.originalName);
    setPreviewUrl(null);
    try {
      const res = await apiClient.get(`/attachments/${attachment.id}/download?view=1`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to preview attachment'));
      setPreviewUrl('');
    }
  }, []);

  const closePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewId(null);
    setPreviewUrl(null);
    setPreviewName('');
  }, []);

  const handleDownload = useCallback(async (attachment: { id: string; originalName: string }) => {
    try {
      const res = await apiClient.get(`/attachments/${attachment.id}/download`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.originalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to download attachment'));
    }
  }, []);

  useEffect(() => {
    const totalPages = attachMeta?.totalPages ?? (attachMeta ? Math.ceil(attachMeta.total / (attachMeta.limit || attachLimit)) || 1 : 1);
    if (attachPage > totalPages) setAttachPage(totalPages || 1);
  }, [attachMeta, attachLimit, attachPage]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => fileInputRef.current?.click()} className="btn-secondary btn-sm" disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload File'}
        </button>
        {isStaff && (
          <select
            value={uploadVisibility}
            onChange={(e) => setUploadVisibility(e.target.value as 'PUBLIC' | 'INTERNAL')}
            className="input text-xs py-1 px-2"
          >
            <option value="PUBLIC">Public</option>
            <option value="INTERNAL">Internal</option>
          </select>
        )}
        <input ref={fileInputRef} type="file" onChange={handleFileSelect} className="hidden" />
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <p className="text-sm text-red-600">Failed to load attachments.</p>}
      {!isLoading && !isError && (!attachments || attachments.length === 0) && (
        <EmptyState title="No attachments" description="Upload files to attach to this ticket." />
      )}

      {attachments && attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((attachment) => {
            const isImage = attachment.mimeType?.startsWith('image/');
            return (
              <div key={attachment.id} className="flex items-center justify-between rounded-lg border border-blue-100 bg-white px-4 py-3 dark:border-navy-800 dark:bg-navy-900">
                <div className="flex items-center gap-3 min-w-0">
                  {isImage ? (
                    <Thumbnail id={attachment.id} alt={attachment.originalName} onClick={() => openPreview(attachment)} />
                  ) : (
                    <svg className="h-8 w-8 shrink-0 text-navy-400 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-navy-950 truncate dark:text-blue-50">
                        {isImage ? (
                          <button onClick={() => openPreview(attachment)} className="hover:underline text-left">
                            {attachment.originalName}
                          </button>
                        ) : (
                          attachment.originalName
                        )}
                      </p>
                      {attachment.visibility === 'INTERNAL' && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          Internal
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-navy-500 dark:text-blue-300">
                      {formatFileSize(attachment.size)} &middot;{' '}
                      {attachment.user ? getUserDisplayName(attachment.user) : 'Unknown'}{' '}
                      &middot; {formatDate(attachment.createdAt)}
                    </p>
                  </div>
                </div>
                <button onClick={() => handleDownload(attachment)} className="btn-secondary btn-sm shrink-0">
                  Download
                </button>
              </div>
            );
          })}
        </div>
      )}

      {attachMeta && (
        <Pagination
          page={attachPage}
          totalPages={attachMeta.totalPages ?? (Math.ceil(attachMeta.total / attachLimit) || 1)}
          onPageChange={(p) => setAttachPage(p)}
          limit={attachLimit}
          onLimitChange={(l) => { setAttachLimit(l); setAttachPage(1); }}
          totalItems={attachMeta.total}
        />
      )}

      {previewId && previewUrl !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={closePreview}>
          <button onClick={closePreview} className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {previewUrl === '' ? (
            <p className="text-white text-sm">Failed to load image.</p>
          ) : (
            <img
              src={previewUrl}
              alt={previewName}
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
}
