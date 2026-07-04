import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useLandingPageContent } from '@/hooks/use-landing-page';
import { LANDING_DEFAULT_CONTENT } from '@/lib/landing-defaults';
import Hero from '@/components/landing/Hero';
import QuickActions from '@/components/landing/QuickActions';
import ContactInfo from '@/components/landing/ContactInfo';
import FaqSection from '@/components/landing/FaqSection';
import LandingFooter from '@/components/landing/LandingFooter';

export default function LandingPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data, isError } = useLandingPageContent();

  if (isAuthenticated) {
    return <Navigate to="/tickets" replace />;
  }

  const content = isError || !data ? LANDING_DEFAULT_CONTENT : data;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <Hero />
      <QuickActions />
      <ContactInfo contact={content.contact} />
      <FaqSection faqs={content.faqs} />
      <LandingFooter />
    </div>
  );
}
