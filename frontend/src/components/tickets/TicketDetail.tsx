import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTicket, useUpdateTicketStatus, useAssignTicket, useDeleteTicket } from '@/hooks/use-tickets';
import { useAssignableUsers } from '@/hooks/use-users';
import { useAuthStore } from '@/stores/auth-store';
import StatusBadge from './StatusBadge';
import PriorityBadge from './PriorityBadge';
import CommentSection from './CommentSection';
import AttachmentList from './AttachmentList';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { formatDateTime, formatRelativeTime, getSLAColor, getUserDisplayName, getErrorMessage } from '@/lib/utils';
import Avatar from '@/components/ui/Avatar';
import type { TicketStatus, Ticket } from '@/types';

interface TicketDetailProps {
  ticketId: string;
}

const statusFlows: Record<TicketStatus, TicketStatus[]> = {
  Open: ['InProgress'],
  InProgress: ['OnHold', 'Resolved'],
  OnHold: ['InProgress'],
  Resolved: ['Closed'],
  Closed: ['Open'],
};

function AssignedToDisplay({ ticket }: { ticket: Ticket }) {
  return (
    <p className="mt-1 text-sm text-navy-950 dark:text-blue-50">
      {ticket.assignedTo ? getUserDisplayName(ticket.assignedTo) : 'Unassigned'}
    </p>
  );
}

function AssignedToSelect({ ticket, users }: { ticket: Ticket; users: { id: string; name: string }[] }) {
  const assignMutation = useAssignTicket();
  return (
    <select
      value={ticket.assignedToId ?? ''}
      onChange={(e) => {
        const id = e.target.value || null;
        if (id !== (ticket.assignedToId ?? null)) {
          assignMutation.mutate(
            { id: ticket.id, assignedToId: id },
          );
        }
      }}
      className="mt-1 input text-sm"
      disabled={assignMutation.isPending || ticket.assignedTo?.isActive === false}
      title={ticket.assignedTo?.isActive === false ? 'Assigned user is inactive — reactivate to change' : ''}
    >
      <option value="">Unassigned</option>
      {users?.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
    </select>
  );
}

export default function TicketDetail({ ticketId }: TicketDetailProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canAssign = user && (user.role === 'ITSupport' || user.role === 'Admin');
  const canChangeStatus = user && (user.role === 'ITSupport' || user.role === 'Admin');
  const isAdmin = user?.role === 'Admin';
  const { data: ticket, isLoading, isError, error, refetch } = useTicket(ticketId);
  const { data: assignableUsers } = useAssignableUsers({ enabled: !!canAssign });
  const updateStatusMutation = useUpdateTicketStatus();
  const deleteTicketMutation = useDeleteTicket();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const availableStatuses = ticket ? statusFlows[ticket.status] : [];
  const canCloseOwnResolved = user?.role === 'EndUser' && ticket?.requesterId === user?.id && ticket?.status === 'Resolved';

  if (isLoading) {
    return (
      <div className="card p-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorMessage
        message={getErrorMessage(error, 'Failed to load ticket')}
        onRetry={() => refetch()}
      />
    );
  }

  if (!ticket) {
    return <ErrorMessage title="Ticket not found" message="The ticket you are looking for does not exist." />;
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-header">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-sm font-medium text-primary-600 dark:text-primary-400">{ticket.ticketNumber}</span>
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
              </div>
              <h1 className="text-xl font-semibold text-navy-950 dark:text-blue-50">{ticket.subject}</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canChangeStatus &&
                availableStatuses.map((status) => (
                  <button
                    key={status}
                    onClick={() =>
                      updateStatusMutation.mutate(
                        { id: ticket.id, status },
                      )
                    }
                    className="btn-secondary btn-sm"
                    disabled={updateStatusMutation.isPending}
                  >
                    Mark {status === 'InProgress' ? 'In Progress' : status === 'OnHold' ? 'On Hold' : status}
                  </button>
                ))}
              {canCloseOwnResolved && (
                <button
                  onClick={() =>
                        updateStatusMutation.mutate(
                          { id: ticket.id, status: 'Closed' },
                        )
                      }
                  className="btn-secondary btn-sm"
                  disabled={updateStatusMutation.isPending}
                >
                  Close Ticket
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn-danger btn-sm"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card-body space-y-6">
          <p className="text-sm text-navy-700 whitespace-pre-wrap dark:text-blue-200">{ticket.description}</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Created By</label>
              <p className="mt-1 text-sm text-navy-950 dark:text-blue-50">
                {ticket.requester ? getUserDisplayName(ticket.requester) : 'Unknown'}
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Assigned To</label>
              {canAssign && assignableUsers ? (
                <AssignedToSelect ticket={ticket} users={assignableUsers} />
              ) : (
                <AssignedToDisplay ticket={ticket} />
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Category</label>
              <p className="mt-1 text-sm text-navy-950 dark:text-blue-50">{ticket.category?.name ?? '-'}</p>
              {ticket.subCategory && (
                <p className="text-xs text-navy-500 dark:text-blue-300">{ticket.subCategory.name}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Location</label>
              <p className="mt-1 text-sm text-navy-950 dark:text-blue-50">{ticket.location?.name ?? '-'}</p>
            </div>

            <div>
              <label className="text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Item Code</label>
              <p className="mt-1 text-sm text-navy-950 dark:text-blue-50">{ticket.itemCode || '-'}</p>
            </div>

            <div>
              <label className="text-xs font-medium text-navy-500 uppercase dark:text-blue-300">SLA Status</label>
              <p className={`mt-1 text-sm font-medium ${getSLAColor(ticket.slaStatus || '')}`}>
                {ticket.slaStatus || 'N/A'}
                {ticket.slaDueAt && ` (by ${formatDateTime(ticket.slaDueAt)})`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Created</label>
              <p className="mt-1 text-sm text-navy-950 dark:text-blue-50">{formatDateTime(ticket.createdAt)}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Updated</label>
              <p className="mt-1 text-sm text-navy-950 dark:text-blue-50">{formatDateTime(ticket.updatedAt)}</p>
            </div>
            {ticket.resolvedAt && (
              <div>
                <label className="text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Resolved</label>
                <p className="mt-1 text-sm text-navy-950 dark:text-blue-50">{formatDateTime(ticket.resolvedAt)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-navy-950 dark:text-blue-50">Comments</h2>
        </div>
        <div className="card-body">
          <CommentSection ticketId={ticketId} />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-navy-950 dark:text-blue-50">Attachments</h2>
        </div>
        <div className="card-body">
          <AttachmentList ticketId={ticketId} />
        </div>
      </div>

      {ticket.histories && ticket.histories.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-navy-950 dark:text-blue-50">Audit Trail</h2>
          </div>
          <div className="card-body">
            <div className="flow-root">
              <ul className="-mb-8">
                {ticket.histories!.map((entry, idx) => (
                  <li key={entry.id}>
                    <div className="relative pb-8">
                      {idx < ticket.histories!.length - 1 && (
                        <span
                          className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-blue-100 dark:bg-navy-800"
                          aria-hidden="true"
                        />
                      )}
                      <div className="relative flex gap-3">
                        <Avatar name={entry.user?.name ?? '?'} size="sm" className="ring-8 ring-white dark:ring-navy-900" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-navy-700 dark:text-blue-200">
                            <span className="font-medium text-navy-950 dark:text-blue-50">
                              {entry.user ? getUserDisplayName(entry.user) : 'Unknown'}
                            </span>{' '}
                            {entry.field === 'status' ? 'changed status' :
                             entry.field === 'priority' ? 'changed priority' :
                             entry.field === 'assignedTo' ? 'changed assignment' :
                             entry.field ? `updated ${entry.field}` : 'updated ticket'}
                            {entry.oldValue && entry.newValue && (
                              <>
                                {' '}
                                from <span className="font-medium text-navy-500 dark:text-blue-300">"{entry.oldValue}"</span> to{' '}
                                <span className="font-medium text-navy-950 dark:text-blue-50">"{entry.newValue}"</span>
                              </>
                            )}
                          </p>
                          <p className="text-xs text-navy-500 dark:text-blue-300">{formatRelativeTime(entry.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          deleteTicketMutation.mutate(ticket.id, {
            onSuccess: () => {
              navigate('/tickets');
            },
          });
        }}
        title="Delete Ticket"
        message={`Are you sure you want to delete ticket ${ticket.ticketNumber}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteTicketMutation.isPending}
      />
    </div>
  );
}
