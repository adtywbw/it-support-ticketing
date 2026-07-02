import type { DashboardCurrentSnapshot } from '@/types';

type CurrentSnapshotCardsProps = {
  current: DashboardCurrentSnapshot;
};

export default function CurrentSnapshotCards({ current }: CurrentSnapshotCardsProps) {
  const cards = [
    { label: 'Active Tickets', value: current.activeTickets, tone: 'text-gray-900 dark:text-gray-100' },
    { label: 'Open', value: current.open, tone: 'text-blue-600 dark:text-blue-400' },
    { label: 'In Progress', value: current.inProgress, tone: 'text-yellow-600 dark:text-yellow-400' },
    { label: 'SLA Risk', value: current.slaRisk, tone: 'text-red-600 dark:text-red-400' },
    { label: 'Unassigned', value: current.unassigned, tone: 'text-orange-600 dark:text-orange-400' },
  ];

  return (
    <section aria-labelledby="current-snapshot-heading" className="space-y-3">
      <h2 id="current-snapshot-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Current Snapshot
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="card">
            <div className="card-body">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
              <p className={`mt-2 text-3xl font-bold ${card.tone}`}>{card.value}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
