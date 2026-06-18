import { Link } from 'react-router-dom';
import TicketList from '@/components/tickets/TicketList';

export default function TicketsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
        <Link to="/tickets/new" className="btn-primary">
          Create Ticket
        </Link>
      </div>
      <TicketList />
    </div>
  );
}
