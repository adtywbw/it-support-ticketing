import { useState, type FormEvent } from 'react';
import { useTicketComments, useAddComment } from '@/hooks/use-tickets';
import { useAuthStore } from '@/stores/auth-store';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { formatRelativeTime, getInitials } from '@/lib/utils';
import type { Comment } from '@/types';

interface CommentSectionProps {
  ticketId: number;
}

export default function CommentSection({ ticketId }: CommentSectionProps) {
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const user = useAuthStore((s) => s.user);

  const { data: comments, isLoading, isError } = useTicketComments(ticketId);
  const addCommentMutation = useAddComment();

  const canSeeInternal = user && (user.role === 'ITSupport' || user.role === 'Admin');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    addCommentMutation.mutate(
      { ticketId, content: content.trim(), isInternal },
      {
        onSuccess: () => {
          setContent('');
          setIsInternal(false);
        },
      },
    );
  };

  const visibleComments = comments?.filter(
    (c: Comment) => !c.isInternal || !!canSeeInternal,
  );

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
        <div className="flex items-center justify-between">
          {canSeeInternal && (
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Internal note (visible to IT support & admin only)
            </label>
          )}
          <button
            type="submit"
            disabled={!content.trim() || addCommentMutation.isPending}
            className="btn-primary btn-sm"
          >
            {addCommentMutation.isPending ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </form>

      <div className="space-y-4">
        {isLoading && <LoadingSpinner />}

        {isError && (
          <p className="text-sm text-red-600">Failed to load comments.</p>
        )}

        {!isLoading && !isError && (!visibleComments || visibleComments.length === 0) && (
          <EmptyState title="No comments yet" description="Be the first to comment on this ticket." />
        )}

        {visibleComments?.map((comment: Comment) => (
          <div
            key={comment.id}
            className={`rounded-lg border p-4 ${
              comment.isInternal ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                  {comment.user
                    ? getInitials(comment.user.firstName, comment.user.lastName)
                    : '??'}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {comment.user
                      ? `${comment.user.firstName} ${comment.user.lastName}`
                      : 'Unknown User'}
                  </p>
                  <p className="text-xs text-gray-500">{formatRelativeTime(comment.createdAt)}</p>
                </div>
              </div>
              {comment.isInternal && (
                <span className="rounded bg-yellow-200 px-2 py-0.5 text-xs font-medium text-yellow-800">
                  Internal
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
