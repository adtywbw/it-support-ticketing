import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { SubCategoryManager } from '../MasterDataManagement';

const mockUseCategories = vi.fn();

vi.mock('@/hooks/use-categories', () => ({
  useCategories: () => mockUseCategories(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderWithProviders(ui: React.ReactElement) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockSubCategory(subOverrides: Record<string, unknown> = {}) {
  mockUseCategories.mockReturnValue({
    data: [
      {
        id: 'cat-1',
        name: 'Network',
        description: null,
        isActive: true,
        createdAt: '',
        updatedAt: '',
        _count: { tickets: 0, subCategories: 1, slaConfigs: 0 },
        subCategories: [
          {
            id: 'sub-1',
            name: 'Wi-Fi',
            description: null,
            isActive: true,
            createdAt: '',
            updatedAt: '',
            categoryId: 'cat-1',
            _count: { tickets: 0, faqs: 0 },
            ...subOverrides,
          },
        ],
      },
    ],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

describe('SubCategoryManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubCategory();
  });

  it('blocks delete and reports FAQ usage', async () => {
    mockSubCategory({ _count: { tickets: 0, faqs: 2 } });
    const user = userEvent.setup();
    renderWithProviders(<SubCategoryManager />);
    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(screen.getByText(/2 FAQ/i)).toBeInTheDocument();
    expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
  });
});
