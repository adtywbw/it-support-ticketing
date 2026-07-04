import type { LandingPageContent } from '@/types';

export const LANDING_HERO = {
  title: 'IT Support Hub',
  subtitle: 'Get help with your IT issues, fast. Sign in to submit a ticket and track its progress.',
  ctaLabel: 'Sign in to submit a ticket',
};

export const LANDING_QUICK_ACTIONS = [
  {
    id: 'submit',
    title: 'Submit a ticket',
    description: 'Report an IT issue and get it resolved.',
    ctaLabel: 'Sign in to submit',
  },
  {
    id: 'check-status',
    title: 'Check ticket status',
    description: 'View the status of your existing tickets.',
    ctaLabel: 'Sign in to view',
  },
];

export const LANDING_EMPTY_CONTACT_MESSAGE = 'Contact details will be available soon.';
export const LANDING_EMPTY_FAQ_MESSAGE = 'No FAQs available yet.';

export const LANDING_FOOTER = {
  orgName: 'Support Hub',
  signInLabel: 'Sign in',
};

export const LANDING_DEFAULT_CONTENT: LandingPageContent = {
  contact: {
    email: '',
    phone: '',
    hours: '',
    location: '',
  },
  faqs: [],
};
