import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '@/stores/auth-store';
import type { UserRole, RefreshResponse } from '@/types';
import { API_BASE_URL } from '@/lib/axios';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, user, login } = useAuthStore();
  const location = useLocation();
  const [checking, setChecking] = useState(isAuthenticated ? false : true);
  const navigateState = useRef({ from: location }).current;

  useEffect(() => {
    if (isAuthenticated) return;

    axios
      .post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        const data = res.data.data as RefreshResponse | undefined;
        if (data?.accessToken && data.user) {
          login(data.user, data.accessToken);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [isAuthenticated, login]);

  if (checking) return null;

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={navigateState} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/tickets" replace />;
  }

  return <>{children}</>;
}
