import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient, { unwrapData } from '@/lib/axios';
import type { LandingPageContent, UpdateLandingPageContentPayload } from '@/types';

export function useUpdateLandingPageContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateLandingPageContentPayload) => {
      const response = await apiClient.put('/landing-page/content', data);
      return unwrapData(response) as LandingPageContent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landing-page'] });
    },
    onError: () => {
      toast.error('Failed to save landing page content');
    },
  });
}
