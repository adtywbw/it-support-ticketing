import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from '../StatusBadge';

describe('StatusBadge', () => {
  it('renders Open status', () => {
    render(<StatusBadge status="Open" />);
    expect(screen.getByText('Open')).toBeDefined();
  });

  it('renders InProgress as In Progress', () => {
    render(<StatusBadge status="InProgress" />);
    expect(screen.getByText('In Progress')).toBeDefined();
  });

  it('renders OnHold as On Hold', () => {
    render(<StatusBadge status="OnHold" />);
    expect(screen.getByText('On Hold')).toBeDefined();
  });

  it('renders Resolved status', () => {
    render(<StatusBadge status="Resolved" />);
    expect(screen.getByText('Resolved')).toBeDefined();
  });

  it('renders Closed status', () => {
    render(<StatusBadge status="Closed" />);
    expect(screen.getByText('Closed')).toBeDefined();
  });
});
