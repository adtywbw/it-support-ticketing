import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SLAConfigManager from '../SLAConfigManager';

const mockUseSLAConfigs = vi.fn();
const mockUseCreateSLAConfig = vi.fn();
const mockUseUpdateSLAConfig = vi.fn();
const mockUseCategories = vi.fn();
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();

vi.mock('@/hooks/use-sla-configs', () => ({
  useSLAConfigs: () => mockUseSLAConfigs(),
  useCreateSLAConfig: () => mockUseCreateSLAConfig(),
  useUpdateSLAConfig: () => mockUseUpdateSLAConfig(),
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

describe('SLAConfigManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateSLAConfig.mockReturnValue({ mutate: mockCreateMutate, isPending: false });
    mockUseUpdateSLAConfig.mockReturnValue({ mutate: mockUpdateMutate, isPending: false });
    mockUseCategories.mockReturnValue({
      data: [
        { id: 'cat-1', name: 'Network', isActive: true },
        { id: 'cat-2', name: 'Inactive Category', isActive: false },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseSLAConfigs.mockReturnValue({
      data: [
        {
          id: 'sla-1',
          categoryId: 'cat-1',
          category: { id: 'cat-1', name: 'Network' },
          priority: 'High',
          responseTimeMinutes: 60,
          resolutionTimeMinutes: 240,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('should render SLA configs with formatted durations', () => {
    render(<SLAConfigManager />);

    expect(screen.getByText('Network')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('1 hour')).toBeInTheDocument();
    expect(screen.getByText('4 hours')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('should create an SLA config using active categories and converted minutes', () => {
    mockUseSLAConfigs.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<SLAConfigManager />);
    fireEvent.click(screen.getAllByText('Add SLA Config')[0]);

    expect(screen.getByRole('option', { name: 'Network' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Inactive Category' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'cat-1' } });
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'Critical' } });
    fireEvent.change(screen.getByLabelText('Response time value'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Response time unit'), { target: { value: 'hours' } });
    fireEvent.change(screen.getByLabelText('Resolution time value'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Resolution time unit'), { target: { value: 'days' } });
    fireEvent.click(screen.getByText('Save'));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      {
        categoryId: 'cat-1',
        priority: 'Critical',
        responseTimeMinutes: 120,
        resolutionTimeMinutes: 1440,
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });
});
