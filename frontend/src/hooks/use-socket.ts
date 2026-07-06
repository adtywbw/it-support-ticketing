import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth-store';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/axios';

function getSocketUrl() {
  if (!API_BASE_URL.startsWith('http')) return '/notifications';
  return `${new URL(API_BASE_URL).origin}/notifications`;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const socket = io(getSocketUrl(), {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (import.meta.env.DEV) {
        console.log('[Socket] connected to /notifications');
      }
    });

    socket.on('notification', () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    });

    socket.on('disconnect', (reason) => {
      if (import.meta.env.DEV) {
        console.log('[Socket] disconnected:', reason);
      }
    });

    socket.on('reconnect_attempt', () => {
      const latestToken = useAuthStore.getState().accessToken;
      if (latestToken) {
        socket.auth = { token: latestToken };
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, isAuthenticated, queryClient]);
}
