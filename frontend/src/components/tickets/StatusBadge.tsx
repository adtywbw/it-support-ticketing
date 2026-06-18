import { getStatusColor } from '@/lib/utils';
import type { TicketStatus } from '@/types';

interface StatusBadgeProps {
  status: TicketStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(status)}`}
    >
      {status === 'InProgress' ? 'In Progress' : status}
    </span>
  );
}
