import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LandingContactForm from '../LandingContactForm';
import LandingFaqEditor from '../LandingFaqEditor';

vi.mock('@/hooks/use-update-landing-page', () => ({
  useUpdateLandingPageContent: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('Landing Page admin editors', () => {
  it('hydrates contact form fields from saved admin content', () => {
    render(
      <LandingContactForm
        contact={{
          email: 'it@company.com',
          phone: '123',
          hours: '9-5',
          location: 'Office A',
        }}
      />,
    );

    expect(screen.getByPlaceholderText('it@company.com')).toHaveValue('it@company.com');
    expect(screen.getByPlaceholderText('+1 234 567 890')).toHaveValue('123');
    expect(screen.getByPlaceholderText('Mon–Fri, 8:00–17:00')).toHaveValue('9-5');
    expect(screen.getByPlaceholderText('Office A, Building B')).toHaveValue('Office A');
  });

  it('hydrates FAQ editor entries from saved admin content', () => {
    render(
      <LandingFaqEditor
        faqs={[
          { id: 'faq-1', question: 'How do I get help?', answer: 'Open a ticket.', order: 0, active: true },
          { id: 'faq-2', question: 'When is support open?', answer: 'Weekdays.', order: 1, active: false },
        ]}
      />,
    );

    expect(screen.getByDisplayValue('How do I get help?')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Open a ticket.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('When is support open?')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Weekdays.')).toBeInTheDocument();
  });
});
