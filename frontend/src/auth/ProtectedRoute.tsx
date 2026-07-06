import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import type { UserRole } from '@/types';
import { refreshAccessToken } from '@/lib/axios';

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
    let cancelled = false;

    refreshAccessToken()
      .then(({ accessToken, user }) => {
        if (cancelled) return;
        if (accessToken && user) {
          login(user, accessToken);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => { cancelled = true; };
  }, [isAuthenticated, login]);

  if (checking) return <div className="flex items-center justify-center min-h-screen"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" role="status"><span className="sr-only">Loading...</span></div></div>;

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={navigateState} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/tickets" replace />;
  }

  return <>{children}</>;
}
