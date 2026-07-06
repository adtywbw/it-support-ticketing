import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../DashboardPage';

vi.mock('@/components/dashboard/DashboardStats', () => ({
  default: ({ range }: any) => (
    <div data-testid="dashboard-stats">
      <span data-testid="stats-range">{range.range}</span>
    </div>
  ),
}));

vi.mock('@/components/dashboard/DashboardRangeFilter', () => ({
  default: ({ value, onChange }: any) => (
    <div data-testid="range-filter">
      <span data-testid="filter-range">{value.range}</span>
      <button
        data-testid="set-7d"
        onClick={() => onChange({ range: '7d', from: undefined, to: undefined })}
      >
        7 Days
      </button>
      <button
        data-testid="set-90d"
        onClick={() => onChange({ range: '90d', from: undefined, to: undefined })}
      >
        90 Days
      </button>
    </div>
  ),
}));

function renderDashboardPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Dashboard heading and description', () => {
    renderDashboardPage();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Operational overview and support performance')).toBeInTheDocument();
  });

  it('renders DashboardStats component', () => {
    renderDashboardPage();

    expect(screen.getByTestId('dashboard-stats')).toBeInTheDocument();
  });

  it('renders DashboardRangeFilter component', () => {
    renderDashboardPage();

    expect(screen.getByTestId('range-filter')).toBeInTheDocument();
  });

  it('starts with default 30d range', () => {
    renderDashboardPage();

    expect(screen.getByTestId('stats-range')).toHaveTextContent('30d');
    expect(screen.getByTestId('filter-range')).toHaveTextContent('30d');
  });

  it('updates range when filter changes to 7d', () => {
    renderDashboardPage();

    fireEvent.click(screen.getByTestId('set-7d'));

    expect(screen.getByTestId('stats-range')).toHaveTextContent('7d');
    expect(screen.getByTestId('filter-range')).toHaveTextContent('7d');
  });

  it('updates range when filter changes to 90d', () => {
    renderDashboardPage();

    fireEvent.click(screen.getByTestId('set-90d'));

    expect(screen.getByTestId('stats-range')).toHaveTextContent('90d');
    expect(screen.getByTestId('filter-range')).toHaveTextContent('90d');
  });
});
