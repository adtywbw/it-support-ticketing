import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Pagination from '../Pagination';

describe('FE-04 & FE-08: Pagination', () => {
  const defaultProps = {
    page: 1,
    totalPages: 5,
    totalItems: 50,
    limit: 10,
    onPageChange: vi.fn(),
    onLimitChange: vi.fn(),
  };

  it('should render page info and items count', () => {
    render(<Pagination {...defaultProps} />);

    expect(screen.getByText('Items per page:')).toBeInTheDocument();
    expect(screen.getByText('(50 items)')).toBeInTheDocument();
    expect(screen.getByText('1/5')).toBeInTheDocument();
  });

  it('should not have "All" option in limit dropdown', () => {
    render(<Pagination {...defaultProps} />);

    const select = screen.getByRole('combobox');
    const options = Array.from(select.querySelectorAll('option'));
    const labels = options.map((o) => o.textContent);

    expect(labels).not.toContain('All');
  });

  it('should call onPageChange when Next clicked', () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} onPageChange={onPageChange} />);

    const nextBtns = screen.getAllByText('Next');
    fireEvent.click(nextBtns[0]);

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('should disable Previous on first page', () => {
    render(<Pagination {...defaultProps} page={1} />);

    const prevBtn = screen.getByText('Previous');
    expect(prevBtn).toBeDisabled();
  });

  it('should disable Next on last page', () => {
    render(<Pagination {...defaultProps} page={5} />);

    const nextBtns = screen.getAllByText('Next');
    expect(nextBtns[0]).toBeDisabled();
  });
});
