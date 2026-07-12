import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FaqManager from '../FaqManager';

const mockUseAllFaqs = vi.fn();
const mockUseCreateFaq = vi.fn();
const mockUseUpdateFaq = vi.fn();
const mockUseDeleteFaq = vi.fn();
const mockUseFaqAnalytics = vi.fn();
const mockUseCategories = vi.fn();
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockRefetchAnalytics = vi.fn();

vi.mock('@/hooks/use-faqs', () => ({
  useAllFaqs: () => mockUseAllFaqs(),
  useCreateFaq: () => mockUseCreateFaq(),
  useUpdateFaq: () => mockUseUpdateFaq(),
  useDeleteFaq: () => mockUseDeleteFaq(),
  useFaqAnalytics: () => mockUseFaqAnalytics(),
}));

vi.mock('@/hooks/use-categories', () => ({
  useCategories: () => mockUseCategories(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const categoryId = 'cat-1';

function mockFaqAnalyticsError() {
  mockUseFaqAnalytics.mockReturnValue({
    isLoading: false,
    isError: true,
    error: new Error(),
    data: undefined,
    refetch: mockRefetchAnalytics,
  });
}

describe('FaqManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAllFaqs.mockReturnValue({
      data: [
        {
          id: '1',
          question: 'Test?',
          answer: 'Answer.',
          displayOrder: 0,
          isActive: true,
          categoryId: null,
          keywords: [],
          category: null,
          createdAt: '',
          updatedAt: '',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseCreateFaq.mockReturnValue({ mutate: mockCreateMutate, isPending: false });
    mockUseUpdateFaq.mockReturnValue({ mutate: mockUpdateMutate, isPending: false });
    mockUseDeleteFaq.mockReturnValue({ mutate: mockDeleteMutate, isPending: false });
    mockUseFaqAnalytics.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      data: {
        range: '30d',
        from: '',
        to: '',
        recommendationSessions: 100,
        resolvedWithoutTicketSessions: 80,
        continuedToTicketSessions: 20,
        deflectionRate: 80,
        continuedToTicketRate: 20,
        topOpenedFaqs: [],
        topResolvedFaqs: [],
        categoryStats: [],
      },
      refetch: mockRefetchAnalytics,
    });
    mockUseCategories.mockReturnValue({
      data: [
        { id: 'cat-1', name: 'Network', isActive: true },
        { id: 'cat-2', name: 'Software', isActive: true },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('submits normalized category and comma-separated keywords', async () => {
    const user = userEvent.setup();
    render(<FaqManager />);
    await user.click(screen.getByRole('button', { name: /add faq/i }));
    await user.type(screen.getByLabelText(/question/i), 'Reset Wi-Fi');
    await user.type(screen.getByLabelText(/answer/i), 'Restart the adapter.');
    await user.selectOptions(screen.getByLabelText(/category/i), categoryId);
    await user.type(screen.getByLabelText(/keywords/i), ' Wi-Fi, adapter, wi-fi ');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId,
        keywords: ['wi-fi', 'adapter'],
      }),
      expect.anything(),
    );
  });

  it('shows analytics retry UI when the summary query fails', async () => {
    const user = userEvent.setup();
    mockFaqAnalyticsError();
    render(<FaqManager />);
    expect(await screen.findByText(/failed to load faq analytics/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(mockRefetchAnalytics).toHaveBeenCalled();
  });
});
