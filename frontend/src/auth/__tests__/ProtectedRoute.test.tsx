import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('axios');

describe('FE-01: ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false });
    vi.clearAllMocks();
  });

  it('should redirect to /login when not authenticated and refresh fails', async () => {
    const axios = await import('axios');
    vi.mocked(axios.default.post).mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter initialEntries={['/tickets']}>
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
      <MemoryRouter>
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
      <MemoryRouter initialEntries={['/admin/users']}>
        <ProtectedRoute allowedRoles={['Admin']}>
          <div>Admin Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });
});
