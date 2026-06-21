import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '@/stores/auth-store';
import type { UserRole } from '@/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, user, login } = useAuthStore();
  const location = useLocation();
  const [checking, setChecking] = useState(isAuthenticated ? false : true);

  useEffect(() => {
    if (isAuthenticated) return;

    axios
      .post('/api/auth/refresh', {}, { withCredentials: true })
      .then((res) => {
        if (res.data.accessToken) {
          login(res.data.user, res.data.accessToken);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [isAuthenticated, login]);

  if (checking) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/tickets" replace />;
  }

  return <>{children}</>;
}
