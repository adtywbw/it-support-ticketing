import { useLandingPageAdminContent } from '@/hooks/use-landing-page';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import LandingContactForm from '@/components/admin/LandingContactForm';
import LandingFaqEditor from '@/components/admin/LandingFaqEditor';

export default function AdminLandingPagePage() {
  const { data, isLoading, isError, refetch } = useLandingPageAdminContent();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Landing Page Content</h1>

      {isLoading && <LoadingSpinner size="lg" />}

      {isError && (
        <ErrorMessage
          message="Failed to load landing page content"
          onRetry={() => refetch()}
        />
      )}

      {data && (
        <>
          <LandingContactForm contact={data.contact} />
          <LandingFaqEditor faqs={data.faqs} />
        </>
      )}
    </div>
  );
}
