import { getPriorityColor } from '@/lib/utils';
import type { TicketPriority } from '@/types';

interface PriorityBadgeProps {
  priority: TicketPriority;
}

export default function PriorityBadge({ priority }: PriorityBadgeProps) {
  const icons: Record<TicketPriority, string> = {
    Low: '↓',
    Medium: '→',
    High: '↑',
    Critical: '!!',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${getPriorityColor(priority)}`}
    >
      <span>{icons[priority]}</span>
      {priority}
    </span>
  );
}
