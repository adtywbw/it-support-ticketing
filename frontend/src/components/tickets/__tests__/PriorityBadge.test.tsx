import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PriorityBadge from '../PriorityBadge';

describe('PriorityBadge', () => {
  it('renders Low priority', () => {
    render(<PriorityBadge priority="Low" />);
    expect(screen.getByText('Low')).toBeDefined();
  });

  it('renders Medium priority', () => {
    render(<PriorityBadge priority="Medium" />);
    expect(screen.getByText('Medium')).toBeDefined();
  });

  it('renders High priority', () => {
    render(<PriorityBadge priority="High" />);
    expect(screen.getByText('High')).toBeDefined();
  });

  it('renders Critical priority', () => {
    render(<PriorityBadge priority="Critical" />);
    expect(screen.getByText('Critical')).toBeDefined();
  });
});
