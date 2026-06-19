import { useTicket, useUpdateTicketStatus, useAssignTicket, useTicketAuditTrail } from '@/hooks/use-tickets';
import { useUsers } from '@/hooks/use-users';
import { useAuthStore } from '@/stores/auth-store';
import StatusBadge from './StatusBadge';
import PriorityBadge from './PriorityBadge';
import CommentSection from './CommentSection';
import AttachmentList from './AttachmentList';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { formatDateTime, formatRelativeTime, getSLAColor, getUserInitials, getUserDisplayName } from '@/lib/utils';
import type { TicketStatus, Ticket } from '@/types';

interface TicketDetailProps {
  ticketId: string;
}

const statusFlows: Record<TicketStatus, TicketStatus[]> = {
  Open: ['InProgress', 'Resolved', 'Closed'],
  InProgress: ['Resolved', 'Closed', 'Open'],
  Resolved: ['Closed', 'Open'],
  Closed: ['Open'],
};

function AssignedToDisplay({ ticket }: { ticket: Ticket }) {
  return (
    <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
      {ticket.assignedTo ? getUserDisplayName(ticket.assignedTo) : 'Unassigned'}
    </p>
  );
}

function AssignedToSelect({ ticket, users }: { ticket: Ticket; users: { id: string; name: string; role: string; isActive: boolean }[] }) {
  const assignMutation = useAssignTicket();
  return (
    <select
      value={ticket.assignedToId ?? ''}
      onChange={(e) => {
        const id = e.target.value || undefined;
        if (id && id !== ticket.assignedToId) {
          assignMutation.mutate({ id: ticket.id, assignedToId: id });
        }
      }}
      className="mt-1 input text-sm"
      disabled={assignMutation.isPending}
    >
      <option value="">Unassigned</option>
      {users
        ?.filter((u) => u.isActive && (u.role === 'ITSupport' || u.role === 'Admin'))
        .map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
    </select>
  );
}

export default function TicketDetail({ ticketId }: TicketDetailProps) {
  const user = useAuthStore((s) => s.user);
  const { data: ticket, isLoading, isError, error, refetch } = useTicket(ticketId);
  const { data: users } = useUsers();
  const { data: auditTrail } = useTicketAuditTrail(ticketId);
  const updateStatusMutation = useUpdateTicketStatus();

  const canAssign = user && (user.role === 'ITSupport' || user.role === 'Admin');
  const canChangeStatus = user && (user.role === 'ITSupport' || user.role === 'Admin');
  const availableStatuses = ticket ? statusFlows[ticket.status] : [];

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
        message={(error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load ticket'}
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
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{ticket.subject}</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canChangeStatus &&
                availableStatuses.map((status) => (
                  <button
                    key={status}
                    onClick={() =>
                      updateStatusMutation.mutate({ id: ticket.id, status })
                    }
                    className="btn-secondary btn-sm"
                    disabled={updateStatusMutation.isPending}
                  >
                    Mark {status === 'InProgress' ? 'In Progress' : status}
                  </button>
                ))}
            </div>
          </div>
        </div>

        <div className="card-body space-y-6">
          <p className="text-sm text-gray-700 whitespace-pre-wrap dark:text-gray-300">{ticket.description}</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Created By</label>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                {ticket.requester ? getUserDisplayName(ticket.requester) : 'Unknown'}
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Assigned To</label>
              {canAssign && users ? (
                <AssignedToSelect ticket={ticket} users={users} />
              ) : (
                <AssignedToDisplay ticket={ticket} />
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Category</label>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{ticket.category?.name ?? '-'}</p>
              {ticket.subCategory && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{ticket.subCategory.name}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">SLA Status</label>
              <p className={`mt-1 text-sm font-medium ${getSLAColor(ticket.slaStatus || '')}`}>
                {ticket.slaStatus || 'N/A'}
                {ticket.slaDueAt && ` (by ${formatDateTime(ticket.slaDueAt)})`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Created</label>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{formatDateTime(ticket.createdAt)}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Updated</label>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{formatDateTime(ticket.updatedAt)}</p>
            </div>
            {ticket.resolvedAt && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Resolved</label>
                <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{formatDateTime(ticket.resolvedAt)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Comments</h2>
        </div>
        <div className="card-body">
          <CommentSection ticketId={ticketId} />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Attachments</h2>
        </div>
        <div className="card-body">
          <AttachmentList ticketId={ticketId} />
        </div>
      </div>

      {auditTrail && auditTrail.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Audit Trail</h2>
          </div>
          <div className="card-body">
            <div className="flow-root">
              <ul className="-mb-8">
                {(auditTrail as {
                  id: string;
                  user?: { name: string; firstName?: string; lastName?: string };
                  action: string;
                  field?: string;
                  oldValue?: string;
                  newValue?: string;
                  createdAt: string;
                }[]).map((entry, idx) => (
                  <li key={entry.id}>
                    <div className="relative pb-8">
                      {idx < auditTrail.length - 1 && (
                        <span
                          className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700"
                          aria-hidden="true"
                        />
                      )}
                      <div className="relative flex gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600 ring-8 ring-white dark:bg-gray-600 dark:text-gray-300 dark:ring-gray-800">
                          {entry.user ? getUserInitials(entry.user) : '??'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {entry.user ? getUserDisplayName(entry.user) : 'Unknown'}
                            </span>{' '}
                            {entry.action}
                            {entry.field && (
                              <>
                                {' '}
                                <span className="font-medium">{entry.field}</span>
                                {entry.oldValue && entry.newValue && (
                                  <>
                                    {' '}
                                    from <span className="font-medium text-gray-500 dark:text-gray-400">"{entry.oldValue}"</span> to{' '}
                                    <span className="font-medium text-gray-900 dark:text-gray-100">"{entry.newValue}"</span>
                                  </>
                                )}
                              </>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{formatRelativeTime(entry.createdAt)}</p>
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
    </div>
  );
}
