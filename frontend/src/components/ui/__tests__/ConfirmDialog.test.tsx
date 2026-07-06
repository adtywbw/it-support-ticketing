import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmDialog from '../ConfirmDialog';

vi.mock('../Modal', () => ({
  default: ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title?: string; children: React.ReactNode }) => {
    if (!isOpen) return null;
    return (
      <div role="dialog">
        {title && <h2>{title}</h2>}
        {children}
        <button data-testid="mock-close" onClick={onClose}>X</button>
      </div>
    );
  },
}));

describe('ConfirmDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Delete Ticket',
    message: 'Are you sure?',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and message when open', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Delete Ticket')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<ConfirmDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Delete Ticket')).not.toBeInTheDocument();
  });

  it('renders default button labels', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('renders custom button labels', () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="Yes, Delete" cancelLabel="Keep" />);
    expect(screen.getByText('Yes, Delete')).toBeInTheDocument();
    expect(screen.getByText('Keep')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<ConfirmDialog {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disables buttons when loading', () => {
    render(<ConfirmDialog {...defaultProps} isLoading />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeDisabled();
    expect(screen.getByText('Loading...')).toBeDisabled();
  });

  it('renders danger button variant by default', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn.className).toContain('btn-danger');
  });

  it('renders primary button variant when specified', () => {
    render(<ConfirmDialog {...defaultProps} variant="primary" />);
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn.className).toContain('btn-primary');
  });
});
