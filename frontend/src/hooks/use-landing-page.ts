import { useQuery } from '@tanstack/react-query';
import apiClient, { unwrapData } from '@/lib/axios';
import { STALE_TIME_LANDING_PAGE, STALE_TIME_LANDING_PAGE_ADMIN } from '@/lib/constants';
import type { LandingPageContent } from '@/types';

export function useLandingPageContent() {
  return useQuery({
    queryKey: ['landing-page', 'content'],
    queryFn: async () => {
      const response = await apiClient.get('/landing-page/content');
      return unwrapData(response) as LandingPageContent;
    },
    staleTime: STALE_TIME_LANDING_PAGE,
    retry: 1,
  });
}

export function useLandingPageAdminContent() {
  return useQuery({
    queryKey: ['landing-page', 'content', 'admin'],
    queryFn: async () => {
      const response = await apiClient.get('/landing-page/content/admin');
      return unwrapData(response) as LandingPageContent;
    },
    staleTime: STALE_TIME_LANDING_PAGE_ADMIN,
  });
}
