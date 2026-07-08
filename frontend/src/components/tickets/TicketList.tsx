import { useEffect, useState, useRef, useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTickets, useUpdateTicketPriority, useAssignTicket, useDeleteTicket } from '@/hooks/use-tickets';
import { useAssignableUsers } from '@/hooks/use-users';
import { useAuthStore } from '@/stores/auth-store';
import type { TicketPriority } from '@/types';
import StatusBadge from './StatusBadge';
import PriorityBadge from './PriorityBadge';
import SlaStatusBadge from './SlaStatusBadge';
import Pagination from '@/components/ui/Pagination';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { formatDateTime, getUserDisplayName, getErrorMessage } from '@/lib/utils';
import TicketFilters, { type FilterValues } from './TicketFilters';

interface TicketListProps {
  filters: FilterValues;
  onFiltersChange: (filters: FilterValues) => void;
  page: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

interface SortHeaderProps {
  field: string;
  children: ReactNode;
  className?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
}

function SortHeader({ field, children, className = '', sortBy, sortOrder, onSort }: SortHeaderProps) {
  const isActive = sortBy === field;
  const direction = isActive && sortOrder === 'asc' ? 'asc' : 'desc';
  const ariaSort = isActive ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th
      aria-sort={ariaSort}
      className={`px-6 py-3 text-left text-xs font-medium text-navy-500 dark:text-blue-300 uppercase tracking-wider ${className}`}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded text-left uppercase tracking-wider hover:text-navy-700 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:hover:text-blue-200"
        onClick={() => onSort(field)}
      >
        {children}
        <svg className={`w-3 h-3 transition-opacity ${isActive ? 'opacity-100' : 'opacity-30'}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          {direction === 'asc' ? (
            <path d="M6 2v8M3 5l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M6 10V2M3 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </button>
    </th>
  );
}

export default function TicketList({ filters, onFiltersChange, page, onPageChange, onLimitChange }: TicketListProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canAssign = user && (user.role === 'ITSupport' || user.role === 'Admin');
  const canCreate = !!user;
  const updatePriorityMutation = useUpdateTicketPriority();
  const assignMutation = useAssignTicket();
  const deleteTicketMutation = useDeleteTicket();
  const { data: assignableUsers } = useAssignableUsers({ enabled: !!canAssign });
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; ticketNumber: string } | null>(null);

  const isAdmin = user?.role === 'Admin';
  const limit = filters.limit;

  const queryFilters = useMemo(() => ({
    page,
    limit: filters.limit,
    ...(filters.status.length > 0 && { status: filters.status.join(',') }),
    ...(filters.priority.length > 0 && { priority: filters.priority.join(',') }),
    ...(filters.slaStatus.length > 0 && { slaStatus: filters.slaStatus.join(',') }),
    ...(filters.search && { search: filters.search }),
    ...(filters.categoryId.length > 0 && { categoryId: filters.categoryId.join(',') }),
    ...(filters.locationId.length > 0 && { locationId: filters.locationId.join(',') }),
    ...(filters.requesterId.length > 0 && { requesterId: filters.requesterId.join(',') }),
    ...(filters.assignedToMe && user?.id && { assignedToId: user.id }),
    ...(filters.startDate && { dateFrom: filters.startDate }),
    ...(filters.endDate && { dateTo: filters.endDate }),
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  }), [page, filters, user?.id]);

  const handleSort = (field: string) => {
    const newOrder = filters.sortBy === field && filters.sortOrder === 'asc' ? 'desc' : 'asc';
    onFiltersChange({ ...filters, sortBy: field, sortOrder: newOrder as 'asc' | 'desc' });
  };

  const { data, isError, error, refetch } = useTickets(queryFilters);

  // Use a ref for onPageChange to avoid re-running the effect when the
  // callback identity changes (e.g., when the parent passes an inline arrow
  // function or neglects useCallback). This prevents an infinite re-render
  // loop where the effect triggers a state change that recreates the callback.
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  useEffect(() => {
    const totalPages = data?.meta?.totalPages ?? (data?.meta ? Math.ceil(data.meta.total / (data.meta.limit || limit || 10)) || 1 : 1);
    if (page > totalPages) onPageChangeRef.current(totalPages || 1);
  }, [limit, data?.meta, page]);

  const tickets = data?.data ?? [];
  const meta = data?.meta;
  const loadingInitial = !data && !isError;

  if (loadingInitial) {
    return (
      <div className="card p-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorMessage
        message={getErrorMessage(error, 'Failed to load tickets')}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <TicketFilters filters={filters} onFiltersChange={onFiltersChange} />
      </div>

      {tickets.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No tickets found"
            description={filters.search ? 'Try adjusting your search or filters.' : 'No tickets have been created yet.'}
            action={
              canCreate ? (
                <button onClick={() => navigate('/tickets/new')} className="btn-primary">
                  Create Ticket
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-blue-100 dark:divide-navy-800">
              <thead className="bg-blue-50 dark:bg-navy-900">
                <tr>
                  <SortHeader field="ticketNumber" sortBy={filters.sortBy} sortOrder={filters.sortOrder} onSort={handleSort}>Ticket #</SortHeader>
                  <SortHeader field="subject" sortBy={filters.sortBy} sortOrder={filters.sortOrder} onSort={handleSort}>Subject</SortHeader>
                  <SortHeader field="category" sortBy={filters.sortBy} sortOrder={filters.sortOrder} onSort={handleSort}>Category</SortHeader>
                  <SortHeader field="location" sortBy={filters.sortBy} sortOrder={filters.sortOrder} onSort={handleSort}>Location</SortHeader>
                  <SortHeader field="itemCode" sortBy={filters.sortBy} sortOrder={filters.sortOrder} onSort={handleSort}>Item Code</SortHeader>
                  <SortHeader field="status" sortBy={filters.sortBy} sortOrder={filters.sortOrder} onSort={handleSort}>Status</SortHeader>
                  <SortHeader field="priority" sortBy={filters.sortBy} sortOrder={filters.sortOrder} onSort={handleSort}>Priority</SortHeader>
                  <SortHeader field="slaStatus" sortBy={filters.sortBy} sortOrder={filters.sortOrder} onSort={handleSort}>SLA Status</SortHeader>
                  <SortHeader field="assignedTo" sortBy={filters.sortBy} sortOrder={filters.sortOrder} onSort={handleSort}>Assigned To</SortHeader>
                  <SortHeader field="requester" sortBy={filters.sortBy} sortOrder={filters.sortOrder} onSort={handleSort}>Created By</SortHeader>
                  <SortHeader field="createdAt" sortBy={filters.sortBy} sortOrder={filters.sortOrder} onSort={handleSort}>Created</SortHeader>
                  {isAdmin && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-navy-500 dark:text-blue-300 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-navy-900 divide-y divide-blue-100 dark:divide-navy-800">
                  {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="hover:bg-blue-50 dark:hover:bg-navy-800/60 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-primary-600 dark:text-primary-400">
                      <Link to={`/tickets/${ticket.id}`} className="rounded hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500">
                        {ticket.ticketNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-navy-950 dark:text-blue-50 max-w-xs truncate">
                      <Link to={`/tickets/${ticket.id}`} className="rounded hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500">
                        {ticket.subject}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-navy-500 dark:text-blue-300">
                      {ticket.category?.name ?? '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-navy-500 dark:text-blue-300">
                      {ticket.location?.name ?? '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-navy-500 dark:text-blue-300">
                      {ticket.itemCode || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user && (user.role === 'ITSupport' || user.role === 'Admin') ? (
                        <select
                          value={ticket.priority}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            updatePriorityMutation.mutate(
                              { id: ticket.id, priority: e.target.value as TicketPriority },
                              { onError: (err) => toast.error(getErrorMessage(err, 'Failed to update priority')) },
                            )
                          }
                          disabled={updatePriorityMutation.isPending}
                          className="input text-xs py-1 px-2"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="Critical">Critical</option>
                        </select>
                      ) : (
                        <PriorityBadge priority={ticket.priority} />
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <SlaStatusBadge status={ticket.slaStatus} dueAt={ticket.slaDueAt} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-navy-500 dark:text-blue-300">
                      {canAssign ? (
                        <SearchableSelect
                          value={ticket.assignedToId ?? ''}
                          onChange={(id) => {
                            if (id !== (ticket.assignedToId ?? null)) {
                              assignMutation.mutate(
                                { id: ticket.id, assignedToId: id || null },
                                { onError: (err) => toast.error(getErrorMessage(err, 'Failed to assign ticket')) },
                              );
                            }
                          }}
                          options={(assignableUsers ?? []).map((u) => ({ value: u.id, label: u.name }))}
                          placeholder="Unassigned"
                          disabled={assignMutation.isPending || ticket.assignedTo?.isActive === false}
                          title={ticket.assignedTo?.isActive === false ? 'Assigned user is inactive — reactivate to change' : ''}
                          className="w-[160px]"
                        />
                      ) : (
                        ticket.assignedTo ? getUserDisplayName(ticket.assignedTo) : '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-navy-500 dark:text-blue-300">
                      {ticket.requester ? getUserDisplayName(ticket.requester) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-navy-500 dark:text-blue-300">
                      {formatDateTime(ticket.createdAt)}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ id: ticket.id, ticketNumber: ticket.ticketNumber });
                          }}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                          title="Delete ticket"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && (
            <Pagination
              page={limit > 0 ? meta.page : 1}
              totalPages={limit > 0 ? (meta.totalPages || Math.ceil(meta.total / (meta.limit || 10))) : 1}
              onPageChange={onPageChange}
              limit={limit}
              onLimitChange={onLimitChange}
              totalItems={meta.total}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) {
            deleteTicketMutation.mutate(deleteConfirm.id, {
              onSuccess: () => setDeleteConfirm(null),
              onError: (err) => toast.error(getErrorMessage(err, 'Failed to delete ticket')),
            });
          }
        }}
        title="Delete Ticket"
        message={`Are you sure you want to delete ticket ${deleteConfirm?.ticketNumber ?? ''}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteTicketMutation.isPending}
      />
    </div>
  );
}
