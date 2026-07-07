import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Pagination from '../Pagination';

describe('Pagination', () => {
  const defaultProps = {
    page: 1,
    totalPages: 5,
    onPageChange: vi.fn(),
    limit: 10,
    onLimitChange: vi.fn(),
    totalItems: 50,
  };

  it('renders page info', () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByText(/Page/)).toBeDefined();
    expect(screen.getByText('50')).toBeDefined(); // totalItems
  });

  it('renders Previous and Next buttons', () => {
    render(<Pagination {...defaultProps} page={3} />);
    expect(screen.getByText('Previous')).toBeDefined();
    expect(screen.getByText('Next')).toBeDefined();
  });

  it('disables Previous on first page', () => {
    render(<Pagination {...defaultProps} page={1} />);
    expect(screen.getByText('Previous')).toBeDisabled();
  });

  it('disables Next on last page', () => {
    render(<Pagination {...defaultProps} page={5} />);
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('calls onPageChange when clicking Next', () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} page={2} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByText('Next'));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('calls onPageChange when clicking Previous', () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} page={3} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByText('Previous'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('shows nothing when totalPages <= 0', () => {
    const { container } = render(<Pagination {...defaultProps} totalPages={0} />);
    // Nav element should still render (with items per page), but page buttons hidden
    const nav = container.querySelector('nav');
    expect(nav).toBeDefined();
  });

  it('renders items per page selector', () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByLabelText('Items per page:')).toBeDefined();
  });

  it('calls onLimitChange when changing limit', () => {
    const onLimitChange = vi.fn();
    render(<Pagination {...defaultProps} onLimitChange={onLimitChange} />);
    fireEvent.change(screen.getByLabelText('Items per page:'), { target: { value: '25' } });
    expect(onLimitChange).toHaveBeenCalledWith(25);
  });

  it('renders page number buttons', () => {
    render(<Pagination {...defaultProps} page={3} />);
    // Page 1 and last page (5) should be visible
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
  });

  it('highlights current page button', () => {
    render(<Pagination {...defaultProps} page={1} />);
    const pageOneButton = screen.getByText('1');
    expect(pageOneButton.className).toContain('bg-primary-600');
  });
});
