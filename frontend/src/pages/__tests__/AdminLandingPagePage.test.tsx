import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminLandingPagePage from '../AdminLandingPagePage';

const mockUseLandingPageAdminContent = vi.fn();

vi.mock('@/hooks/use-landing-page', () => ({
  useLandingPageAdminContent: (...args: unknown[]) => mockUseLandingPageAdminContent(...args),
}));

vi.mock('@/components/admin/LandingContactForm', () => ({
  default: ({ contact }: { contact: { email: string } }) => <div data-testid="contact-form">{contact.email || 'empty'}</div>,
}));
vi.mock('@/components/admin/LandingFaqEditor', () => ({
  default: ({ faqs }: { faqs: unknown[] }) => <div data-testid="faq-editor">{faqs.length} faqs</div>,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminLandingPagePage />
    </MemoryRouter>,
  );
}

describe('AdminLandingPagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show page heading', () => {
    mockUseLandingPageAdminContent.mockReturnValue({
      data: { contact: { email: '', phone: '', hours: '', location: '' }, faqs: [] },
      isLoading: false,
      isError: false,
    });

    renderPage();

    expect(screen.getByText('Landing Page Content')).toBeInTheDocument();
  });

  it('should render contact form and FAQ editor with data', () => {
    mockUseLandingPageAdminContent.mockReturnValue({
      data: {
        contact: { email: 'it@company.com', phone: '123', hours: '9-5', location: 'Office' },
        faqs: [
          { id: '1', question: 'Q1', answer: 'A1', order: 0, active: true },
          { id: '2', question: 'Q2', answer: 'A2', order: 1, active: false },
        ],
      },
      isLoading: false,
      isError: false,
    });

    renderPage();

    expect(screen.getByTestId('contact-form')).toHaveTextContent('it@company.com');
    expect(screen.getByTestId('faq-editor')).toHaveTextContent('2 faqs');
  });
});
