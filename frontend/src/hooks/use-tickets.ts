import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/axios';
import type { Ticket, TicketFilters, CreateTicketPayload, PaginatedResponse, TicketStatus } from '@/types';

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
      const response = await apiClient.get<PaginatedResponse<Ticket>>(`/tickets?${params.toString()}`);
      return response.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => {
      const response = await apiClient.get<Ticket>(`/tickets/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateTicketPayload) => {
      const response = await apiClient.post<Ticket>('/tickets', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TicketStatus }) => {
      const response = await apiClient.patch<Ticket>(`/tickets/${id}/status`, { status });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ticket', data.id] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useAssignTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, assignedToId }: { id: string; assignedToId: string }) => {
      const response = await apiClient.patch<Ticket>(`/tickets/${id}/assign`, { assignedToId });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ticket', data.id] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useTicketComments(ticketId: string) {
  return useQuery({
    queryKey: ['ticket', ticketId, 'comments'],
    queryFn: async () => {
      const response = await apiClient.get(`/tickets/${ticketId}/comments`);
      return response.data;
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
    }: {
      ticketId: string;
      content: string;
      type: 'PUBLIC' | 'INTERNAL';
    }) => {
      const response = await apiClient.post(`/tickets/${ticketId}/comments`, { content, type });
      return response.data;
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
      const response = await apiClient.get(`/tickets/${ticketId}/attachments`);
      return response.data;
    },
    enabled: !!ticketId,
  });
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ticketId, file }: { ticketId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiClient.post(`/tickets/${ticketId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ticket', variables.ticketId, 'attachments'] });
    },
  });
}

export function useTicketAuditTrail(ticketId: string) {
  return useQuery({
    queryKey: ['ticket', ticketId, 'audit'],
    queryFn: async () => {
      const response = await apiClient.get(`/tickets/${ticketId}/audit`);
      return response.data;
    },
    enabled: !!ticketId,
  });
}
