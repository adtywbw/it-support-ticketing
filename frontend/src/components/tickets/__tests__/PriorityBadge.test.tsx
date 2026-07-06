import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PriorityBadge from '../PriorityBadge';

describe('PriorityBadge', () => {
  it('renders Low priority', () => {
    render(<PriorityBadge priority="Low" />);
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('renders Medium priority', () => {
    render(<PriorityBadge priority="Medium" />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('renders High priority', () => {
    render(<PriorityBadge priority="High" />);
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders Critical priority', () => {
    render(<PriorityBadge priority="Critical" />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('renders down arrow for Low', () => {
    render(<PriorityBadge priority="Low" />);
    expect(screen.getByText('↓')).toBeInTheDocument();
  });

  it('renders right arrow for Medium', () => {
    render(<PriorityBadge priority="Medium" />);
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('renders up arrow for High', () => {
    render(<PriorityBadge priority="High" />);
    expect(screen.getByText('↑')).toBeInTheDocument();
  });

  it('renders double exclamation for Critical', () => {
    render(<PriorityBadge priority="Critical" />);
    expect(screen.getByText('!!')).toBeInTheDocument();
  });

  it('applies Low color class', () => {
    const { container } = render(<PriorityBadge priority="Low" />);
    expect(container.firstElementChild?.className).toContain('bg-blue-50');
    expect(container.firstElementChild?.className).toContain('text-navy-700');
  });

  it('applies Medium color class', () => {
    const { container } = render(<PriorityBadge priority="Medium" />);
    expect(container.firstElementChild?.className).toContain('bg-blue-100');
    expect(container.firstElementChild?.className).toContain('text-blue-800');
  });

  it('applies High color class', () => {
    const { container } = render(<PriorityBadge priority="High" />);
    expect(container.firstElementChild?.className).toContain('bg-orange-100');
    expect(container.firstElementChild?.className).toContain('text-orange-800');
  });

  it('applies Critical color class', () => {
    const { container } = render(<PriorityBadge priority="Critical" />);
    expect(container.firstElementChild?.className).toContain('bg-red-100');
    expect(container.firstElementChild?.className).toContain('text-red-800');
  });
});
