import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { getAccessToken, useAuthStore } from '@/stores/auth-store';
import type { User } from '@/types';

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

export interface ApiEnvelope<T> {
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages?: number;
  };
}

export function unwrapData<T>(response: AxiosResponse<ApiEnvelope<T>>): T {
  return response.data.data;
}

export function unwrapPage<T>(response: AxiosResponse<ApiEnvelope<T[]>>): { data: T[]; meta: ApiEnvelope<T[]>['meta'] } {
  return {
    data: response.data.data,
    meta: response.data.meta,
  };
}

export function unwrapBlob(response: AxiosResponse<Blob>): Blob {
  return response.data;
}

interface FailedRequest {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}

let isRefreshing = false;
let failedQueue: FailedRequest[] = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry && error.response?.config?.url !== '/auth/refresh' && error.response?.config?.url !== '/auth/login') {
      if (!getAccessToken()) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post<{ data: { accessToken: string; user: User } }>(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        const { accessToken, user } = response.data.data;

        if (!accessToken) {
          const authError = new Error('No access token received');
          processQueue(authError, null);
          useAuthStore.getState().logout();
          window.location.href = '/login';
          return Promise.reject(authError);
        }

        useAuthStore.getState().setAccessToken(accessToken);
        if (user) {
          useAuthStore.getState().setUser(user);
        }
        processQueue(null, accessToken);
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.status === 503) {
      const role = useAuthStore.getState().user?.role;
      if (role === 'Admin') {
        const currentPath = window.location.pathname;
        if (currentPath !== '/admin/maintenance' && currentPath !== '/login') {
          window.location.href = '/admin/maintenance';
        }
      }
      return Promise.reject(error);
    }

    return Promise.reject(error);
  },
);

export async function refreshAccessToken(): Promise<{ accessToken: string; user: User }> {
  const response = await axios.post<{ data: { accessToken: string; user: User } }>(
    `${API_BASE_URL}/auth/refresh`,
    {},
    { withCredentials: true },
  );
  const { accessToken, user } = response.data.data;
  if (!accessToken) {
    throw new Error('No access token received');
  }
  return { accessToken, user };
}

export default apiClient;
