import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../LoginPage';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('@/auth/LoginForm', () => ({
  default: () => (
    <form aria-label="Sign in form">
      <button type="submit">Sign in</button>
    </form>
  ),
}));

vi.mock('@/components/ui/FaqSection', () => ({
  default: ({ variant }: { variant?: string }) => (
    <section data-testid={`faq-${variant ?? 'standalone'}`}>FAQ content</section>
  ),
}));

function renderLoginPage(initialEntries: ComponentProps<typeof MemoryRouter>['initialEntries'] = ['/login']) {
  return render(
    <MemoryRouter initialEntries={initialEntries} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false });
    vi.clearAllMocks();
  });

  it('renders the Enterprise Portal support-assist layout for unauthenticated users', () => {
    renderLoginPage();

    expect(screen.getByLabelText('Support Hub')).toHaveTextContent('SH');
    expect(screen.getByText('IT Service Portal')).toBeInTheDocument();
    expect(screen.getByText('Secure Access')).toBeInTheDocument();
    expect(screen.getByText('Need help signing in?')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Sign in form' })).toBeInTheDocument();
    expect(screen.getByTestId('faq-portal')).toBeInTheDocument();
  });

  it('shows the routed warning message inside the portal form area', () => {
    renderLoginPage([{ pathname: '/login', state: { message: 'Session expired' } }]);

    expect(screen.getByRole('status')).toHaveTextContent('Session expired');
  });
});
