import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CreateTicketPage from '../CreateTicketPage';

vi.mock('@/components/tickets/CreateTicketForm', () => ({
  default: () => <form data-testid="create-ticket-form">Create Form</form>,
}));

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CreateTicketPage />
    </MemoryRouter>,
  );
}

describe('CreateTicketPage', () => {
  it('renders heading and CreateTicketForm', () => {
    renderPage();
    expect(screen.getByText('Create New Ticket')).toBeInTheDocument();
    expect(screen.getByTestId('create-ticket-form')).toBeInTheDocument();
  });
});
