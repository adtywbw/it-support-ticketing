import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PasswordChangeSection from '../PasswordChangeSection';

vi.mock('@/hooks/use-change-password', () => ({
  useChangePassword: vi.fn(),
}));

vi.mock('@/components/ui/PasswordInput', () => ({
  default: (props: any) => (
    <input
      type="password"
      data-testid="mock-password-input"
      value={props.value || ''}
      onChange={props.onChange}
      placeholder={props.label || ''}
    />
  ),
}));

const mockMutate = vi.fn();
const mockLogout = vi.fn();

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector?: any) => {
    const state = { logout: mockLogout };
    return selector ? selector(state) : state;
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual as any, useNavigate: () => vi.fn() };
});

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return { ...actual as any };
});

import { useChangePassword } from '@/hooks/use-change-password';

function renderWithProviders() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><PasswordChangeSection /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PasswordChangeSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useChangePassword).mockReturnValue({ mutate: mockMutate, isPending: false } as any);
  });

  it('renders heading and form labels', () => {
    renderWithProviders();
    expect(screen.getAllByText('Change Password')[1]).toBeInTheDocument();
    expect(screen.getByText('Current Password')).toBeInTheDocument();
    expect(screen.getByText('New Password')).toBeInTheDocument();
    expect(screen.getByText('Confirm New Password')).toBeInTheDocument();
  });

  it('renders 3 password inputs', () => {
    renderWithProviders();
    const inputs = screen.getAllByTestId('mock-password-input');
    expect(inputs).toHaveLength(3);
  });

  it('shows error when new password is too short', async () => {
    renderWithProviders();
    const inputs = screen.getAllByTestId('mock-password-input');
    fireEvent.change(inputs[0], { target: { value: 'current-pass' } });
    fireEvent.change(inputs[1], { target: { value: 'short' } });
    fireEvent.change(inputs[2], { target: { value: 'short' } });
    fireEvent.click(screen.getAllByText('Change Password')[1]);

    await waitFor(() => {
      expect(screen.getByText('New password must be at least 8 characters')).toBeInTheDocument();
    });
  });

  it('shows error when passwords do not match', async () => {
    renderWithProviders();
    const inputs = screen.getAllByTestId('mock-password-input');
    fireEvent.change(inputs[0], { target: { value: 'current-pass' } });
    fireEvent.change(inputs[1], { target: { value: 'new-pass-123' } });
    fireEvent.change(inputs[2], { target: { value: 'different-pass' } });
    fireEvent.click(screen.getAllByText('Change Password')[1]);

    await waitFor(() => {
      expect(screen.getByText('New passwords do not match')).toBeInTheDocument();
    });
  });

  it('calls mutate with correct data on valid submission', async () => {
    mockMutate.mockImplementation((_payload: unknown, { onSuccess }: { onSuccess: () => void }) => {
      onSuccess();
    });
    renderWithProviders();

    const inputs = screen.getAllByTestId('mock-password-input');
    fireEvent.change(inputs[0], { target: { value: 'current-pass' } });
    fireEvent.change(inputs[1], { target: { value: 'new-pass-123' } });
    fireEvent.change(inputs[2], { target: { value: 'new-pass-123' } });
    fireEvent.click(screen.getAllByText('Change Password')[1]);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { currentPassword: 'current-pass', newPassword: 'new-pass-123' },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });
  });

  it('displays API error on mutation failure', async () => {
    mockMutate.mockImplementation((_payload: unknown, { onError }: { onError: (err: Error) => void }) => {
      onError(new Error('Invalid current password'));
    });
    renderWithProviders();

    const inputs = screen.getAllByTestId('mock-password-input');
    fireEvent.change(inputs[0], { target: { value: 'wrong-pass' } });
    fireEvent.change(inputs[1], { target: { value: 'new-pass-123' } });
    fireEvent.change(inputs[2], { target: { value: 'new-pass-123' } });
    fireEvent.click(screen.getAllByText('Change Password')[1]);

    await waitFor(() => {
      expect(screen.getByText('Invalid current password')).toBeInTheDocument();
    });
  });
});
