import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminUsersPage from '../AdminUsersPage';

vi.mock('@/components/admin/UserManagement', () => ({
  default: () => <div data-testid="user-management">User Management</div>,
}));

describe('AdminUsersPage', () => {
  it('renders heading and UserManagement component', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminUsersPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Admin - User Management')).toBeInTheDocument();
    expect(screen.getByTestId('user-management')).toBeInTheDocument();
  });
});
