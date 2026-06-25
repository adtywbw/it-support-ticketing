import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTickets, useUpdateTicketPriority, useAssignTicket, useDeleteTicket } from '@/hooks/use-tickets';
import { useAssignableUsers } from '@/hooks/use-users';
import { useAuthStore } from '@/stores/auth-store';
import type { TicketPriority } from '@/types';
import StatusBadge from './StatusBadge';
import PriorityBadge from './PriorityBadge';
import Pagination from '@/components/ui/Pagination';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { formatDateTime, getUserDisplayName, getErrorMessage } from '@/lib/utils';
import TicketFilters, { type FilterValues } from './TicketFilters';

interface TicketListProps {
  filters: FilterValues;
  onFiltersChange: (filters: FilterValues) => void;
  page: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
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

  const queryFilters = {
    page,
    limit: filters.limit,
    ...(filters.status && { status: filters.status }),
    ...(filters.priority && { priority: filters.priority }),
    ...(filters.search && { search: filters.search }),
    ...(filters.categoryId && { categoryId: filters.categoryId }),
    ...(filters.assignedToMe && user?.id && { assignedToId: user.id }),
    ...(filters.startDate && { dateFrom: filters.startDate }),
    ...(filters.endDate && { dateTo: filters.endDate }),
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  };

  const handleSort = (field: string) => {
    const newOrder = filters.sortBy === field && filters.sortOrder === 'asc' ? 'desc' : 'asc';
    onFiltersChange({ ...filters, sortBy: field, sortOrder: newOrder as 'asc' | 'desc' });
  };

  function SortHeader({ field, children, className = '' }: { field: string; children: ReactNode; className?: string }) {
    const isActive = filters.sortBy === field;
    const direction = isActive && filters.sortOrder === 'asc' ? 'asc' : 'desc';
    return (
      <th
        className={`px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300 transition-colors ${className}`}
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          <svg className={`w-3 h-3 transition-opacity ${isActive ? 'opacity-100' : 'opacity-30 group-hover:opacity-60'}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            {direction === 'asc' ? (
              <path d="M6 2v8M3 5l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M6 10V2M3 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </span>
      </th>
    );
  }

  const { data, isLoading, isError, error, refetch } = useTickets(queryFilters);

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
        message={getErrorMessage(error, 'Failed to load tickets')}
        onRetry={() => refetch()}
      />
    );
  }

  const tickets = data?.data ?? [];
  const meta = data?.meta;

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
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <SortHeader field="ticketNumber">Ticket #</SortHeader>
                  <SortHeader field="subject">Subject</SortHeader>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Category
                  </th>
                  <SortHeader field="status">Status</SortHeader>
                  <SortHeader field="priority">Priority</SortHeader>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Assigned To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Created By
                  </th>
                  <SortHeader field="createdAt">Created</SortHeader>
                  {isAdmin && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-primary-600 dark:text-primary-400">
                      {ticket.ticketNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate">
                      {ticket.subject}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {ticket.category?.name ?? '-'}
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
                            updatePriorityMutation.mutate({ id: ticket.id, priority: e.target.value as TicketPriority })
                          }
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {canAssign ? (
                        <select
                          value={ticket.assignedToId ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const id = e.target.value || null;
                            if (id !== (ticket.assignedToId ?? null)) {
                              assignMutation.mutate({ id: ticket.id, assignedToId: id });
                            }
                          }}
                          className="input text-xs py-1 px-2"
                        >
                          <option value="">Unassigned</option>
                          {assignableUsers
                            ?.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        ticket.assignedTo ? getUserDisplayName(ticket.assignedTo) : '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {ticket.requester ? getUserDisplayName(ticket.requester) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
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
