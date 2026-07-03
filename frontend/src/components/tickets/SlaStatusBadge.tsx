import { formatDateTime } from '@/lib/utils';
import type { SLAStatus } from '@/types';

interface SlaStatusBadgeProps {
  status: SLAStatus | null | undefined;
  dueAt?: string | null;
}

const pillColors: Record<string, string> = {
  OnTrack: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  AtRisk: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Breached: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const labels: Record<string, string> = {
  OnTrack: 'On Track',
  AtRisk: 'At Risk',
  Breached: 'Breached',
};

export default function SlaStatusBadge({ status, dueAt }: SlaStatusBadgeProps) {
  const label = status ? (labels[status] ?? status) : 'N/A';
  const colorClass = status ? (pillColors[status] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300') : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';

  let tooltip = '';
  if (dueAt) {
    if (status === 'Breached') {
      tooltip = `Overdue (was due: ${formatDateTime(dueAt)})`;
    } else {
      tooltip = `Due: ${formatDateTime(dueAt)}`;
    }
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
      title={tooltip}
    >
      {label}
    </span>
  );
}
