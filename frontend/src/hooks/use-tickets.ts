import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient, { unwrapData, unwrapPage, type ApiEnvelope } from '@/lib/axios';
import type { Ticket, TicketFilters, CreateTicketPayload, Comment, Attachment, TicketStatus, TicketPriority } from '@/types';

export function useTickets(filters: TicketFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== null) {
      params.append(key, String(value));
    }
  });

  return useQuery({
    queryKey: ['tickets', filters],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Ticket[]>>(`/tickets?${params.toString()}`);
      return unwrapPage(response);
    },
    placeholderData: (prev) => prev,
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Ticket>>(`/tickets/${id}`);
      return unwrapData(response);
    },
    enabled: !!id,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateTicketPayload) => {
      const response = await apiClient.post<ApiEnvelope<Ticket>>('/tickets', payload);
      return unwrapData(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TicketStatus }) => {
      const response = await apiClient.patch<ApiEnvelope<Ticket>>(`/tickets/${id}/status`, { status });
      return unwrapData(response);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ticket', data.id] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useAssignTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, assignedToId }: { id: string; assignedToId: string | null }) => {
      const response = await apiClient.patch<ApiEnvelope<Ticket>>(`/tickets/${id}/assign`, { assignedToId });
      return unwrapData(response);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ticket', data.id] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
export function useTicketComments(ticketId: string) {
  return useQuery({
    queryKey: ['ticket', ticketId, 'comments'],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Comment[]>>(`/tickets/${ticketId}/comments`);
      return unwrapData(response);
    },
    enabled: !!ticketId,
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      content,
      type,
      files,
    }: {
      ticketId: string;
      content: string;
      type: 'PUBLIC' | 'INTERNAL';
      files?: File[];
    }) => {
      const formData = new FormData();
      formData.append('content', content);
      formData.append('type', type);
      if (files) {
        files.forEach((file) => formData.append('files', file));
      }
      const response = await apiClient.post<ApiEnvelope<Comment>>(`/tickets/${ticketId}/comments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return unwrapData(response);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ticket', variables.ticketId, 'comments'] });
    },
  });
}

export function useTicketAttachments(ticketId: string) {
  return useQuery({
    queryKey: ['ticket', ticketId, 'attachments'],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Attachment[]>>(`/tickets/${ticketId}/attachments`);
      return unwrapData(response);
    },
    enabled: !!ticketId,
  });
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ticketId, file, visibility }: { ticketId: string; file: File; visibility?: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      if (visibility) formData.append('visibility', visibility);
      const response = await apiClient.post<ApiEnvelope<Attachment>>(`/tickets/${ticketId}/attachments`, formData);
      return unwrapData(response);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ticket', variables.ticketId, 'attachments'] });
    },
  });
}

export function useUpdateTicketPriority() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: TicketPriority }) => {
      const response = await apiClient.patch<ApiEnvelope<Ticket>>(`/tickets/${id}/priority`, { priority });
      return unwrapData(response);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ticket', data.id] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/tickets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
