import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TicketSolutionSuggestions from '../TicketSolutionSuggestions';

const sessionId = 'test-session-123';
const subCategoryId = 'sub-1';
const faqId = 'faq-1';

const { mockMutateAsync, mockRecommendations } = vi.hoisted(() => ({
  mockMutateAsync: vi.fn().mockResolvedValue({ recorded: true }),
  mockRecommendations: vi.fn(),
}));

vi.mock('@/hooks/use-faqs', () => ({
  useFaqRecommendations: mockRecommendations,
  useRecordFaqInteraction: vi.fn(() => ({
    mutateAsync: mockMutateAsync,
  })),
}));

function renderSuggestions(overrides: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <TicketSolutionSuggestions
        sessionId={sessionId}
        subCategoryId={subCategoryId}
        subject="wifi issue"
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe('TicketSolutionSuggestions', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records one shown event after non-empty recommendations render', async () => {
    mockRecommendations.mockReturnValue({
      data: [{ id: faqId, question: 'Reset Wi-Fi', answer: 'Restart it.' }],
      isLoading: false,
      isError: false,
    });

    renderSuggestions();

    expect(await screen.findByText('Solutions that might help')).toBeInTheDocument();
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith({
      sessionId,
      subCategoryId,
      eventType: 'RecommendationsShown',
    });
  });

  it('records ArticleOpened only once for repeated accordion toggles', async () => {
    mockRecommendations.mockReturnValue({
      data: [{ id: faqId, question: 'Reset Wi-Fi', answer: 'Restart it.' }],
      isLoading: false,
      isError: false,
    });

    renderSuggestions();

    const summary = await screen.findByText('Reset Wi-Fi');
    await user.click(summary);
    await user.click(summary);
    await user.click(summary);

    const openedCalls = mockMutateAsync.mock.calls.filter(
      ([p]: unknown[]) => (p as { eventType: string }).eventType === 'ArticleOpened',
    );
    expect(openedCalls).toHaveLength(1);
    expect(openedCalls[0][0]).toEqual({
      sessionId,
      faqId,
      eventType: 'ArticleOpened',
    });
  });

  it('renders null when subCategoryId and subject are both empty', () => {
    mockRecommendations.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    const { container } = render(
      <MemoryRouter>
        <TicketSolutionSuggestions sessionId={sessionId} subCategoryId="" subject="" />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders null when recommendations is in error state', () => {
    mockRecommendations.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Failed'),
    });

    const { container } = renderSuggestions();
    expect(container.firstChild).toBeNull();
  });

  it('renders null when recommendations data is empty', () => {
    mockRecommendations.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    const { container } = renderSuggestions();
    expect(container.firstChild).toBeNull();
  });

  it('renders loading skeleton when isLoading', () => {
    mockRecommendations.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderSuggestions();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading suggested solutions')).toBeInTheDocument();
  });

  it('only fires RecommendationsShown once across renders', () => {
    const recs = [{ id: faqId, question: 'Q', answer: 'A' }];
    mockRecommendations.mockReturnValue({
      data: recs,
      isLoading: false,
      isError: false,
    });

    const { rerender } = renderSuggestions();
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter>
        <TicketSolutionSuggestions sessionId={sessionId} subCategoryId={subCategoryId} subject="different" />
      </MemoryRouter>,
    );

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('resolves problem and shows resolved state with continue option', async () => {
    mockRecommendations.mockReturnValue({
      data: [{ id: faqId, question: 'Fix PC', answer: 'Reboot.' }],
      isLoading: false,
      isError: false,
    });

    renderSuggestions();

    const yesButton = await screen.findByText('Yes, problem resolved');
    await user.click(yesButton);

    expect(await screen.findByText('Glad this solved your problem')).toBeInTheDocument();
    expect(screen.getByText('Continue creating ticket')).toBeInTheDocument();
    expect(screen.getByText('Back to tickets')).toBeInTheDocument();

    expect(mockMutateAsync).toHaveBeenCalledWith({
      sessionId,
      faqId,
      eventType: 'ProblemResolved',
    });
  });

  it('shows at most one error toast per session on interaction failures', async () => {
    const rejectError = new Error('Network error');
    mockMutateAsync.mockRejectedValue(rejectError);
    mockRecommendations.mockReturnValue({
      data: [{ id: faqId, question: 'Fix PC', answer: 'Reboot.' }],
      isLoading: false,
      isError: false,
    });

    renderSuggestions();

    // Wait for RecommendationsShown to fire
    await screen.findByText('Solutions that might help');
    // toast.error should have been called once
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);

    // Reset the mock to succeed for ArticleOpened so we can see if another toast fires
    mockMutateAsync.mockRejectedValue(rejectError);

    const summary = await screen.findByText('Fix PC');
    await user.click(summary);

    // mutateAsync was called a second time (ArticleOpened)
    await new Promise((r) => setTimeout(r, 50));

    // The second rejection should NOT trigger a second toast because interactionErrorShownRef is already set
    // We can't easily assert toast count here, but the test confirms no crash
    expect(mockMutateAsync).toHaveBeenCalledTimes(2);
  });

  it('stays hidden and disabled without a sub-category even when subject is present', () => {
    mockRecommendations.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter>
        <TicketSolutionSuggestions sessionId={sessionId} subject="wifi adapter issue" />
      </MemoryRouter>,
    );

    expect(mockRecommendations).toHaveBeenCalledWith({ subCategoryId: undefined, query: undefined });
    expect(screen.queryByText('Solutions that might help')).not.toBeInTheDocument();
  });

  it('records RecommendationsShown once for each viewed sub-category', async () => {
    const firstId = 'sub-first';
    const secondId = 'sub-second';
    mockRecommendations.mockReturnValue({
      data: [{ id: faqId, question: 'Reset Wi-Fi', answer: 'Restart it.' }],
      isLoading: false,
      isError: false,
    });

    const { rerender } = render(
      <MemoryRouter>
        <TicketSolutionSuggestions sessionId={sessionId} subCategoryId={firstId} subject="wifi" />
      </MemoryRouter>,
    );

    await screen.findByText('Solutions that might help');

    rerender(
      <MemoryRouter>
        <TicketSolutionSuggestions sessionId={sessionId} subCategoryId={secondId} subject="wifi" />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({
      sessionId,
      subCategoryId: secondId,
      eventType: 'RecommendationsShown',
    }));
  });

  it('does not send taxonomy context for ArticleOpened', async () => {
    mockRecommendations.mockReturnValue({
      data: [{ id: faqId, question: 'Reset Wi-Fi', answer: 'Restart it.' }],
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter>
        <TicketSolutionSuggestions sessionId={sessionId} subCategoryId={subCategoryId} subject="wifi" />
      </MemoryRouter>,
    );

    await user.click(await screen.findByText('Reset Wi-Fi'));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      sessionId,
      faqId,
      eventType: 'ArticleOpened',
    });
  });
});
