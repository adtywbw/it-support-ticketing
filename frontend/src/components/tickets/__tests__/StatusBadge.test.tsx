import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from '../StatusBadge';

describe('StatusBadge', () => {
  it('renders Open status', () => {
    render(<StatusBadge status="Open" />);
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('renders InProgress as "In Progress"', () => {
    render(<StatusBadge status="InProgress" />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders OnHold as "On Hold"', () => {
    render(<StatusBadge status="OnHold" />);
    expect(screen.getByText('On Hold')).toBeInTheDocument();
  });

  it('renders Resolved status', () => {
    render(<StatusBadge status="Resolved" />);
    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });

  it('renders Closed status', () => {
    render(<StatusBadge status="Closed" />);
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('applies Open color class', () => {
    const { container } = render(<StatusBadge status="Open" />);
    expect(container.firstElementChild?.className).toContain('bg-blue-100');
    expect(container.firstElementChild?.className).toContain('text-blue-800');
  });

  it('applies InProgress color class', () => {
    const { container } = render(<StatusBadge status="InProgress" />);
    expect(container.firstElementChild?.className).toContain('bg-yellow-100');
    expect(container.firstElementChild?.className).toContain('text-yellow-800');
  });

  it('applies OnHold color class', () => {
    const { container } = render(<StatusBadge status="OnHold" />);
    expect(container.firstElementChild?.className).toContain('bg-purple-100');
    expect(container.firstElementChild?.className).toContain('text-purple-800');
  });

  it('applies Resolved color class', () => {
    const { container } = render(<StatusBadge status="Resolved" />);
    expect(container.firstElementChild?.className).toContain('bg-green-100');
    expect(container.firstElementChild?.className).toContain('text-green-800');
  });

  it('applies Closed color class', () => {
    const { container } = render(<StatusBadge status="Closed" />);
    expect(container.firstElementChild?.className).toContain('bg-blue-50');
    expect(container.firstElementChild?.className).toContain('text-navy-700');
  });
});
