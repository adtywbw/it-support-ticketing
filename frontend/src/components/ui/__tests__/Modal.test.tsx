import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Modal from '../Modal';

describe('Modal accessibility', () => {
  it('renders as a labelled modal dialog', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Delete item">
        <button>Confirm</button>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Delete item' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('traps tab focus inside the modal', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Actions">
        <button>First action</button>
        <button>Second action</button>
      </Modal>,
    );

    const closeBtn = screen.getByRole('button', { name: 'Close dialog' });
    const first = screen.getByText('First action');
    const second = screen.getByText('Second action');
    first.focus();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(second);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });
});
