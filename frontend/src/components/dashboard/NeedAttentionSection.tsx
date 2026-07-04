import { Link } from 'react-router-dom';
import type { DashboardAttention, DashboardTicketSummary } from '@/types';

type NeedAttentionSectionProps = {
  attention: DashboardAttention;
};

const priorityClasses: Record<string, string> = {
  Critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  High: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  Medium: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  Low: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
};

function formatDateTime(value: string | null) {
  if (!value) return 'No SLA due date';
  return new Date(value).toLocaleString();
}

function TicketRow({ ticket }: { ticket: DashboardTicketSummary }) {
  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className="block rounded-md border border-slate-200 p-3 transition hover:border-primary-300 hover:bg-primary-50 dark:border-slate-700 dark:hover:border-primary-700 dark:hover:bg-primary-950/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {ticket.ticketNumber} · {ticket.subject}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {ticket.status === 'InProgress' ? 'In Progress' : ticket.status} · SLA {formatDateTime(ticket.slaDueAt)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${priorityClasses[ticket.priority]}`}>
          {ticket.priority}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Assigned to {ticket.assignedTo?.name ?? 'Unassigned'}
      </p>
    </Link>
  );
}

function AttentionCard({ title, emptyMessage, tickets }: { title: string; emptyMessage: string; tickets: DashboardTicketSummary[] }) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      </div>
      <div className="card-body">
        {tickets.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function NeedAttentionSection({ attention }: NeedAttentionSectionProps) {
  return (
    <section aria-labelledby="need-attention-heading" className="space-y-3">
      <h2 id="need-attention-heading" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        Need Attention
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AttentionCard title="SLA Risk" emptyMessage="No tickets currently at risk." tickets={attention.slaRisk} />
        <AttentionCard title="Critical / High Priority" emptyMessage="No high-priority tickets need attention." tickets={attention.highPriority} />
        <AttentionCard title="Unassigned" emptyMessage="All active tickets are assigned." tickets={attention.unassigned} />
      </div>
    </section>
  );
}
