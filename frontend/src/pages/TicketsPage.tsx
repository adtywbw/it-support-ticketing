import { useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '@/lib/axios';
import { useAuthStore } from '@/stores/auth-store';
import TicketList from '@/components/tickets/TicketList';

export default function TicketsPage() {
  const user = useAuthStore((s) => s.user);
  const [exporting, setExporting] = useState(false);
  const canExport = user && (user.role === 'ITSupport' || user.role === 'Admin');

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await apiClient.get('/tickets/export/csv', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tickets-export.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tickets</h1>
        <div className="flex items-center gap-2">
          {canExport && (
            <button onClick={handleExport} disabled={exporting} className="btn-secondary">
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          )}
          <Link to="/tickets/new" className="btn-primary">
            Create Ticket
          </Link>
        </div>
      </div>
      <TicketList />
    </div>
  );
}
