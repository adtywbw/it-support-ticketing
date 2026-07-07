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

  it('renders page and 50 items', () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByText(/Page/)).toBeDefined();
    expect(screen.getByText('50')).toBeDefined();
  });

  it('renders Previous and Next buttons', () => {
    render(<Pagination {...defaultProps} page={3} />);
    expect(screen.getByText('Previous')).toBeDefined();
    // Both mobile and desktop have "Next" — 2 total
    expect(screen.getAllByText('Next').length).toBe(2);
  });

  it('disables Previous on first page', () => {
    render(<Pagination {...defaultProps} page={1} />);
    expect(screen.getByText('Previous')).toBeDisabled();
  });

  it('disables Next on last page', () => {
    render(<Pagination {...defaultProps} page={5} />);
    const all = screen.getAllByText('Next');
    all.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('calls onPageChange when clicking desktop Next', () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} page={2} onPageChange={onPageChange} />);
    const all = screen.getAllByText('Next');
    fireEvent.click(all[1]); // second Next = desktop
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('calls onPageChange when clicking Previous', () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} page={3} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByText('Previous'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('shows items per page when totalPages <= 0', () => {
    const { container } = render(<Pagination {...defaultProps} totalPages={0} />);
    expect(container.querySelector('nav')).toBeDefined();
    expect(screen.getByLabelText('Items per page:')).toBeDefined();
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

  it('renders page 1 and last page in desktop view', () => {
    render(<Pagination {...defaultProps} page={3} />);
    const buttons = screen.getAllByRole('button');
    const pageNums = buttons
      .filter((b) => !['Previous', 'Next', 'Prev'].includes(b.textContent || ''))
      .map((b) => b.textContent);
    expect(pageNums).toContain('1');
    expect(pageNums).toContain('5');
  });

  it('highlights current page button', () => {
    const { container } = render(<Pagination {...defaultProps} page={1} />);
    // Find the desktop nav buttons (not mobile)
    const allButtons = container.querySelectorAll('nav button');
    const currentPage = Array.from(allButtons).find(
      (b) => b.className.includes('bg-primary-600'),
    );
    expect(currentPage).toBeDefined();
    expect(currentPage?.textContent).toBe('1');
  });
});
