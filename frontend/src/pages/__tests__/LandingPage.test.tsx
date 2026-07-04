import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LandingPage from '../LandingPage';
import { useAuthStore } from '@/stores/auth-store';

const mockUseLandingPageContent = vi.fn();

vi.mock('@/hooks/use-landing-page', () => ({
  useLandingPageContent: (...args: unknown[]) => mockUseLandingPageContent(...args),
}));

vi.mock('@/components/landing/Hero', () => ({
  default: () => <div data-testid="hero">Hero</div>,
}));
vi.mock('@/components/landing/QuickActions', () => ({
  default: () => <div data-testid="quick-actions">QuickActions</div>,
}));
vi.mock('@/components/landing/ContactInfo', () => ({
  default: ({ contact }: { contact: { email: string } }) => <div data-testid="contact-info">{contact.email || 'empty'}</div>,
}));
vi.mock('@/components/landing/FaqSection', () => ({
  default: ({ faqs }: { faqs: unknown[] }) => <div data-testid="faq-section">{faqs.length} faqs</div>,
}));
vi.mock('@/components/landing/LandingFooter', () => ({
  default: () => <div data-testid="landing-footer">Footer</div>,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/tickets" element={<div data-testid="tickets-redirect">Tickets</div>} />
        <Route path="/login" element={<div data-testid="login-redirect">Login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().logout();
    mockUseLandingPageContent.mockReturnValue({
      data: { contact: { email: '', phone: '', hours: '', location: '' }, faqs: [] },
      isLoading: false,
      isError: false,
    });
  });

  it('should redirect authenticated users to /tickets', () => {
    useAuthStore.getState().login(
      { id: 'u1', email: 'u@b.com', name: 'U', role: 'EndUser', isActive: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      'token',
    );

    renderPage();

    expect(screen.getByTestId('tickets-redirect')).toBeInTheDocument();
  });

  it('should render all sections for unauthenticated users', () => {
    renderPage();

    expect(screen.getByTestId('hero')).toBeInTheDocument();
    expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
    expect(screen.getByTestId('contact-info')).toBeInTheDocument();
    expect(screen.getByTestId('faq-section')).toBeInTheDocument();
    expect(screen.getByTestId('landing-footer')).toBeInTheDocument();
  });

  it('should pass DB content to child components', () => {
    mockUseLandingPageContent.mockReturnValue({
      data: {
        contact: { email: 'it@company.com', phone: '123', hours: '9-5', location: 'Office' },
        faqs: [{ id: '1', question: 'Q', answer: 'A', order: 0, active: true }],
      },
      isLoading: false,
      isError: false,
    });

    renderPage();

    expect(screen.getByTestId('contact-info')).toHaveTextContent('it@company.com');
    expect(screen.getByTestId('faq-section')).toHaveTextContent('1 faqs');
  });

  it('should use fallback content when API fails', () => {
    mockUseLandingPageContent.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderPage();

    expect(screen.getByTestId('contact-info')).toHaveTextContent('empty');
    expect(screen.getByTestId('faq-section')).toHaveTextContent('0 faqs');
  });
});
