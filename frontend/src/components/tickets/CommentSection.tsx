import { useState, useRef, useCallback, useEffect, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useTicketComments, useAddComment } from '@/hooks/use-tickets';
import { useAuthStore } from '@/stores/auth-store';
import apiClient from '@/lib/axios';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import { formatRelativeTime, formatFileSize, getUserDisplayName, getErrorMessage } from '@/lib/utils';
import { cacheThumbnail, getCachedThumbnail } from '@/lib/thumbnail-cache';
import Avatar from '@/components/ui/Avatar';
import { useFileUpload } from '@/hooks/use-file-upload';
import { MAX_COMMENT_ATTACHMENT_SIZE } from '@/lib/constants';

interface CommentSectionProps {
  ticketId: string;
}

function CommentFileThumbnail({ attachment, onPreview }: { attachment: { id: string; originalName: string }; onPreview: (id: string) => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(() => getCachedThumbnail(attachment.id) ?? null);
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
        apiClient.get(`/attachments/${attachment.id}/download?view=1`, { responseType: 'blob', signal: ctrl.signal })
          .then((r) => {
            const u = URL.createObjectURL(r.data);
            cacheThumbnail(attachment.id, u);
            setBlobUrl(u);
          })
          .catch(() => { if (!ctrl.signal.aborted) setBlobUrl(''); });
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => { observer.disconnect(); ctrl.abort(); };
  }, [attachment.id, blobUrl]);

  if (blobUrl === '') return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-blue-50 text-primary-400 dark:bg-navy-800 dark:text-blue-300">
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
      </svg>
    </div>
  );
  if (blobUrl !== null) return <img src={blobUrl} alt={attachment.originalName} className="h-10 w-10 shrink-0 rounded object-cover cursor-pointer" onClick={() => onPreview(attachment.id)} />;
  return <div ref={imgRef} className="h-10 w-10 shrink-0 rounded bg-blue-100 animate-pulse dark:bg-navy-700" />;
}

export default function CommentSection({ ticketId }: CommentSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const fileUpload = useFileUpload({ maxSizePerFile: MAX_COMMENT_ATTACHMENT_SIZE });
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');
  const previewUrlRef = useRef<string | null>(null);
  const previewCtrlRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const [commentPage, setCommentPage] = useState(1);
  const [commentLimit, setCommentLimit] = useState(20);
  const user = useAuthStore((s) => s.user);

  const { data: commentsData, isLoading, isError } = useTicketComments(ticketId, commentPage, commentLimit);
  const comments = commentsData?.data ?? [];
  const commentMeta = commentsData?.meta;
  const addCommentMutation = useAddComment();

  const canSeeInternal = user && (user.role === 'ITSupport' || user.role === 'Admin');

  // Clean up blob URLs and abort pending preview requests on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      if (previewCtrlRef.current) {
        previewCtrlRef.current.abort();
        previewCtrlRef.current = null;
      }
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      fileUpload.addFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    addCommentMutation.mutate(
      {
        ticketId,
        content: content.trim(),
        type: isInternal ? 'INTERNAL' : 'PUBLIC',
        files: fileUpload.files.length > 0 ? fileUpload.files : undefined,
      },
      {
        onSuccess: () => {
          setContent('');
          setIsInternal(false);
          fileUpload.clearFiles();
        },
      },
    );
  };

  const openPreview = useCallback(async (attachment: { id: string; originalName: string }) => {
    // Cancel any in-flight preview request
    if (previewCtrlRef.current) {
      previewCtrlRef.current.abort();
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    const ctrl = new AbortController();
    previewCtrlRef.current = ctrl;
    setPreviewId(attachment.id);
    setPreviewName(attachment.originalName);
    setPreviewUrl(null);
    try {
      const res = await apiClient.get(`/attachments/${attachment.id}/download?view=1`, {
        responseType: 'blob',
        signal: ctrl.signal,
      });
      if (!mountedRef.current || ctrl.signal.aborted) {
        URL.revokeObjectURL(URL.createObjectURL(res.data));
        return;
      }
      const url = URL.createObjectURL(res.data);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (err) {
      if (mountedRef.current) {
        setPreviewUrl('');
        toast.error(getErrorMessage(err, 'Failed to preview attachment'));
      }
    }
  }, []);

  const closePreview = useCallback(() => {
    if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null; }
    setPreviewId(null); setPreviewUrl(null); setPreviewName('');
  }, []);

  const handleDownload = useCallback(async (attachment: { id: string; originalName: string }) => {
    try {
      const res = await apiClient.get(`/attachments/${attachment.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data); const a = document.createElement('a');
      a.href = url; a.download = attachment.originalName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (err) { toast.error(getErrorMessage(err, 'Failed to download attachment')); }
  }, []);

  useEffect(() => {
    const totalPages = commentMeta?.totalPages ?? (commentMeta ? Math.ceil(commentMeta.total / (commentMeta.limit || commentLimit)) || 1 : 1);
    if (commentPage > totalPages) setCommentPage(totalPages || 1);
  }, [commentMeta, commentLimit, commentPage]);

  const visibleComments = Array.isArray(comments)
    ? comments.filter((c: { type: string }) => c.type !== 'INTERNAL' || !!canSeeInternal)
    : [];

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a comment..."
          rows={3}
          className="input resize-y"
        />
        {fileUpload.errors.length > 0 && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30">{fileUpload.errors[0]}</div>
        )}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {canSeeInternal && (
              <label className="flex items-center gap-2 text-sm text-navy-600 cursor-pointer dark:text-blue-300">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="rounded border-blue-200 text-primary-600 focus:ring-primary-500"
                />
                Internal note
              </label>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary btn-sm"
              disabled={fileUpload.isOverLimit || addCommentMutation.isPending}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
              {fileUpload.isOverLimit ? 'Max 3 files' : 'Attach files'}
            </button>
            <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
          </div>
          <button
            type="submit"
            disabled={!content.trim() || addCommentMutation.isPending}
            className="btn-primary btn-sm"
          >
            {addCommentMutation.isPending ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
        {fileUpload.files.length > 0 && (
          <div className="space-y-1">
            {fileUpload.files.map((file, i) => (
              <div key={`${file.name}-${i}`}
                className="flex items-center justify-between rounded-lg border border-blue-100 bg-white px-3 py-2 dark:border-navy-800 dark:bg-navy-900">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="h-5 w-5 shrink-0 text-navy-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                  <span className="text-sm text-navy-700 truncate dark:text-blue-200">{file.name}</span>
                  <span className="text-xs text-navy-500">{formatFileSize(file.size)}</span>
                </div>
                <button type="button" onClick={() => fileUpload.removeFile(i)}
                  className="text-sm text-red-600 hover:text-red-800 shrink-0">Remove</button>
              </div>
            ))}
          </div>
        )}
      </form>

      <div className="space-y-4">
        {isLoading && <LoadingSpinner />}

        {isError && (
          <ErrorMessage title="Error" message="Failed to load comments." />
        )}

        {!isLoading && !isError && visibleComments.length === 0 && (
          <EmptyState title="No comments yet" description="Be the first to comment on this ticket." />
        )}

        {commentMeta && (
          <Pagination
            page={commentPage}
            totalPages={commentMeta.totalPages ?? (Math.ceil(commentMeta.total / commentLimit) || 1)}
            onPageChange={(p) => setCommentPage(p)}
            limit={commentLimit}
            onLimitChange={(l) => { setCommentLimit(l); setCommentPage(1); }}
            totalItems={commentMeta.total}
          />
        )}

        {visibleComments.map((comment) => (
          <div
            key={comment.id}
            className={`rounded-lg border p-4 ${
              comment.type === 'INTERNAL' ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-900/20' : 'border-blue-100 bg-white dark:border-navy-800 dark:bg-navy-900'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Avatar name={comment.user?.name ?? '?'} size="sm" />
                <div>
                  <p className="text-sm font-medium text-navy-950 dark:text-blue-50">
                    {comment.user ? getUserDisplayName(comment.user) : 'Unknown User'}
                  </p>
                  <p className="text-xs text-navy-500 dark:text-blue-300">{formatRelativeTime(comment.createdAt)}</p>
                </div>
              </div>
              {comment.type === 'INTERNAL' && (
                <span className="rounded bg-yellow-200 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                  Internal
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-navy-700 whitespace-pre-wrap dark:text-blue-200">{comment.content}</p>
            {comment.attachments && comment.attachments.length > 0 && (
              <div className="mt-3 space-y-1">
                {comment.attachments.map((attachment) => {
                  const isImage = attachment.mimeType?.startsWith('image/');
                  return (
                    <div key={attachment.id}
                      className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 dark:border-navy-700 dark:bg-navy-800/50">
                      <div className="flex items-center gap-2 min-w-0">
                        {isImage ? (
                          <CommentFileThumbnail attachment={attachment} onPreview={() => openPreview(attachment)} />
                        ) : (
                          <svg className="h-8 w-8 shrink-0 text-navy-400 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                          </svg>
                        )}
                        <div className="min-w-0">
                          {isImage ? (
                            <button onClick={() => openPreview(attachment)} className="text-sm font-medium text-navy-950 truncate hover:underline dark:text-blue-50 text-left">{attachment.originalName}</button>
                          ) : (
                            <p className="text-sm font-medium text-navy-950 truncate dark:text-blue-50">{attachment.originalName}</p>
                          )}
                          <p className="text-xs text-navy-500">{formatFileSize(attachment.size)}</p>
                        </div>
                      </div>
                      <button onClick={() => handleDownload(attachment)} className="btn-secondary btn-sm shrink-0">Download</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {previewId && previewUrl !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={closePreview}>
          <button onClick={closePreview} className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {previewUrl === '' ? <p className="text-white text-sm">Failed to load image.</p> : (
            <img src={previewUrl} alt={previewName} className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  );
}
