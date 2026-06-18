import CreateTicketForm from '@/components/tickets/CreateTicketForm';

export default function CreateTicketPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Create New Ticket</h1>
      <div className="card p-6">
        <CreateTicketForm />
      </div>
    </div>
  );
}
