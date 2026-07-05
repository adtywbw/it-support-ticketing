import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    })),
    post: vi.fn(),
    get: vi.fn(),
  },
}));

describe('FE-01: ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false });
    vi.clearAllMocks();
  });

  it('should redirect to /login when not authenticated and refresh fails', async () => {
    const axios = await import('axios');
    vi.mocked(axios.default.post).mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter initialEntries={['/tickets']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  it('should render children when already authenticated', () => {
    useAuthStore.setState({
      user: { id: '1', email: 'test@test.com', name: 'Test', role: 'Admin', isActive: true, createdAt: '', updatedAt: '' },
      accessToken: 'valid-token',
      isAuthenticated: true,
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should redirect non-admin from admin-only route', () => {
    useAuthStore.setState({
      user: { id: '1', email: 'test@test.com', name: 'Test', role: 'EndUser', isActive: true, createdAt: '', updatedAt: '' },
      accessToken: 'valid-token',
      isAuthenticated: true,
    });

    render(
      <MemoryRouter initialEntries={['/admin/users']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProtectedRoute allowedRoles={['Admin']}>
          <div>Admin Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('should not render role-restricted children when authenticated state has no user', () => {
    useAuthStore.setState({
      user: null,
      accessToken: 'valid-token',
      isAuthenticated: true,
    });

    render(
      <MemoryRouter initialEntries={['/admin/users']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProtectedRoute allowedRoles={['Admin']}>
          <div>Admin Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('should ignore malformed refresh responses with accessToken but no user', async () => {
    const axios = await import('axios');
    vi.mocked(axios.default.post).mockResolvedValue({
      data: { data: { accessToken: 'valid-token', user: null } },
    });

    render(
      <MemoryRouter initialEntries={['/tickets']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });
});
