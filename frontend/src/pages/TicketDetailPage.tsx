import { useParams, Link } from 'react-router-dom';
import TicketDetail from '@/components/tickets/TicketDetail';

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return (
      <div className="card p-12 text-center">
        <p className="text-slate-500 dark:text-slate-400">Invalid ticket ID.</p>
        <Link to="/tickets" className="btn-primary mt-4 inline-block">
          Back to Tickets
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        to="/tickets"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to Tickets
      </Link>
      <TicketDetail ticketId={id} />
    </div>
  );
}
