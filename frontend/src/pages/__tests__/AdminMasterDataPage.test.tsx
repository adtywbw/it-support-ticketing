import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminMasterDataPage from '../AdminMasterDataPage';

vi.mock('@/components/admin/MasterDataManagement', () => ({
  default: () => <div data-testid="master-data">Master Data</div>,
}));

describe('AdminMasterDataPage', () => {
  it('renders heading and MasterDataManagement component', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminMasterDataPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Admin - Master Data')).toBeInTheDocument();
    expect(screen.getByTestId('master-data')).toBeInTheDocument();
  });
});
