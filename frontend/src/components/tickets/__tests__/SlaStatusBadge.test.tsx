import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SlaStatusBadge from '../SlaStatusBadge';

describe('SlaStatusBadge', () => {
  it('renders "On Track" with green pill for OnTrack status', () => {
    render(<SlaStatusBadge status="OnTrack" />);
    const badge = screen.getByText('On Track');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-800');
  });

  it('renders "At Risk" with yellow pill for AtRisk status', () => {
    render(<SlaStatusBadge status="AtRisk" />);
    const badge = screen.getByText('At Risk');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-yellow-100');
    expect(badge.className).toContain('text-yellow-800');
  });

  it('renders "Breached" with red pill for Breached status', () => {
    render(<SlaStatusBadge status="Breached" />);
    const badge = screen.getByText('Breached');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-red-100');
    expect(badge.className).toContain('text-red-800');
  });

  it('renders "N/A" with slate pill for null status', () => {
    render(<SlaStatusBadge status={null} />);
    const badge = screen.getByText('N/A');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-slate-100');
    expect(badge.className).toContain('text-slate-700');
  });

  it('renders "N/A" with slate pill for undefined status', () => {
    render(<SlaStatusBadge status={undefined} />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('shows due date tooltip when dueAt is provided and not breached', () => {
    render(<SlaStatusBadge status="OnTrack" dueAt="2026-07-05T14:00:00Z" />);
    const badge = screen.getByText('On Track');
    expect(badge.closest('[title]')?.getAttribute('title')).toMatch(/Due:/);
  });

  it('shows overdue tooltip when Breached and dueAt is provided', () => {
    render(<SlaStatusBadge status="Breached" dueAt="2026-07-01T14:00:00Z" />);
    const badge = screen.getByText('Breached');
    expect(badge.closest('[title]')?.getAttribute('title')).toMatch(/Overdue/);
  });

  it('shows no tooltip when dueAt is not provided', () => {
    render(<SlaStatusBadge status="OnTrack" />);
    const badge = screen.getByText('On Track');
    const title = badge.getAttribute('title');
    expect(title === '' || title === null).toBe(true);
  });
});
