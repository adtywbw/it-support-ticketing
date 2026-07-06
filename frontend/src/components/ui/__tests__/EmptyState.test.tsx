import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmptyState from '../EmptyState';

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState title="No items found" />);
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(<EmptyState title="Empty" icon={<span data-testid="test-icon">🔍</span>} />);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('does not render icon div when not provided', () => {
    const { container } = render(<EmptyState title="Empty" />);
    expect(container.querySelector('.mb-4.text-primary-400')).toBeNull();
  });

  it('renders action when provided', () => {
    render(<EmptyState title="Empty" action={<button>Create Ticket</button>} />);
    expect(screen.getByText('Create Ticket')).toBeInTheDocument();
  });

  it('does not render action slot when not provided', () => {
    const { container } = render(<EmptyState title="Empty" />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="Empty" description="Nothing to show" />);
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
  });
});
