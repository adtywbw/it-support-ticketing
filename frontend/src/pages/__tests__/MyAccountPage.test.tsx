import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyAccountPage from '../MyAccountPage';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('@/components/account/NotificationPreferencesSection', () => ({
  default: () => <div data-testid="notification-prefs">Notification Preferences</div>,
}));

vi.mock('@/components/account/PasswordChangeSection', () => ({
  default: () => <div data-testid="password-change">Password Change</div>,
}));

vi.mock('@/components/account/TelegramConfigSection', () => ({
  default: () => <div data-testid="telegram-config">Telegram Config</div>,
}));

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <MyAccountPage />
    </MemoryRouter>,
  );
}

describe('MyAccountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows all sections for Admin', () => {
    useAuthStore.setState({
      user: { id: '1', email: 'admin@test.com', name: 'Admin', role: 'Admin', isActive: true, createdAt: '', updatedAt: '' },
      accessToken: 'token', isAuthenticated: true,
    });
    renderPage();

    expect(screen.getByText('My Account')).toBeInTheDocument();
    expect(screen.getByTestId('notification-prefs')).toBeInTheDocument();
    expect(screen.getByTestId('password-change')).toBeInTheDocument();
    expect(screen.getByTestId('telegram-config')).toBeInTheDocument();
  });

  it('hides Telegram section for ITSupport', () => {
    useAuthStore.setState({
      user: { id: '2', email: 'support@test.com', name: 'Support', role: 'ITSupport', isActive: true, createdAt: '', updatedAt: '' },
      accessToken: 'token', isAuthenticated: true,
    });
    renderPage();

    expect(screen.getByTestId('notification-prefs')).toBeInTheDocument();
    expect(screen.getByTestId('password-change')).toBeInTheDocument();
    expect(screen.queryByTestId('telegram-config')).not.toBeInTheDocument();
  });

  it('hides Password and Telegram sections for EndUser', () => {
    useAuthStore.setState({
      user: { id: '3', email: 'user@test.com', name: 'User', role: 'EndUser', isActive: true, createdAt: '', updatedAt: '' },
      accessToken: 'token', isAuthenticated: true,
    });
    renderPage();

    expect(screen.getByTestId('notification-prefs')).toBeInTheDocument();
    expect(screen.queryByTestId('password-change')).not.toBeInTheDocument();
    expect(screen.queryByTestId('telegram-config')).not.toBeInTheDocument();
  });

  it('renders user initials and email', () => {
    useAuthStore.setState({
      user: { id: '1', email: 'admin@test.com', name: 'System Admin', role: 'Admin', isActive: true, createdAt: '', updatedAt: '' },
      accessToken: 'token', isAuthenticated: true,
    });
    renderPage();

    expect(screen.getByText('admin@test.com')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });
});
