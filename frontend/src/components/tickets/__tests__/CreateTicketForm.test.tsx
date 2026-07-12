import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CreateTicketForm from '../CreateTicketForm';

const sessionId = '00000000-0000-0000-0000-000000000000';
const categoryId = 'cat-1';

const { createTicket, uploadAttachment } = vi.hoisted(() => ({
  createTicket: vi.fn().mockResolvedValue({ id: 'ticket-1' }),
  uploadAttachment: vi.fn().mockResolvedValue({ id: 'att-1' }),
}));

vi.mock('@/hooks/use-tickets', () => ({
  useCreateTicket: vi.fn(() => ({
    mutateAsync: createTicket,
    isPending: false,
  })),
  useUploadAttachment: vi.fn(() => ({
    mutateAsync: uploadAttachment,
    isPending: false,
  })),
}));

vi.mock('@/hooks/use-categories', () => ({
  useCategories: vi.fn(() => ({
    data: [
      {
        id: categoryId,
        name: 'Network',
        description: null,
        isActive: true,
        subCategories: [
          { id: 'sub-1', name: 'Wi-Fi', isActive: true },
        ],
      },
    ],
  })),
}));

vi.mock('@/hooks/use-locations', () => ({
  useLocations: vi.fn(() => ({
    data: [{ id: 'loc-1', name: 'Office', isActive: true }],
  })),
}));

vi.mock('@/hooks/use-file-upload', () => ({
  useFileUpload: vi.fn(() => ({
    files: [],
    previewUrls: [],
    errors: [],
    isOverLimit: false,
    addFiles: vi.fn(),
    removeFile: vi.fn(),
    clearFiles: vi.fn(),
    validateFile: vi.fn(),
    totalSize: 0,
  })),
}));

vi.mock('@/components/tickets/TicketSolutionSuggestions', () => ({
  default: () => <div data-testid="mock-suggestions" />,
}));

async function fillRequiredTicketFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/subject/i), 'My computer is not working');
  await user.selectOptions(screen.getByLabelText(/^Category$/i), categoryId);
  await user.selectOptions(screen.getByLabelText(/^Sub-category$/i), 'sub-1');
  await user.type(
    screen.getByLabelText(/^Description$/i),
    'It keeps restarting every few minutes and I cannot get any work done.',
  );
  await user.selectOptions(screen.getByLabelText(/^Location$/i), 'loc-1');
  await user.type(screen.getByLabelText(/^Item Code$/i), 'IT-001');
  await user.selectOptions(screen.getByLabelText(/^Priority$/i), 'High');
}

function renderForm() {
  return render(
    <MemoryRouter>
      <CreateTicketForm />
    </MemoryRouter>,
  );
}

describe('CreateTicketForm', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps one session ID and includes it in ticket creation', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(sessionId);
    renderForm();

    await fillRequiredTicketFields(user);
    await user.click(screen.getByRole('button', { name: /create ticket/i }));

    expect(createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        selfServiceSessionId: sessionId,
      }),
    );
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('preserves entered description when recommendation inputs change', async () => {
    renderForm();
    const description = screen.getByLabelText(/^Description$/i);
    await user.type(description, 'The adapter fails after every reboot.');
    await user.selectOptions(screen.getByLabelText(/^Category$/i), categoryId);
    expect(description).toHaveValue('The adapter fails after every reboot.');
  });
});
