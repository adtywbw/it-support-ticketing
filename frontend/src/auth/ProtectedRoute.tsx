import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import type { UserRole } from '@/types';
import { refreshAccessToken } from '@/lib/axios';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, user, login } = useAuthStore();
  const location = useLocation();
  const [checking, setChecking] = useState(isAuthenticated ? false : true);

  // Capture the current location once via useRef initial value so the Navigate
  // redirect gets a stable reference. The initial mount URL is the right target
  // for post-login redirect (the user is already at that URL or was auto-redirected).
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
        setChecking(false);
      });

    return () => { cancelled = true; };
  }, [isAuthenticated, login]);

  if (checking) return <LoadingSpinner className="min-h-screen" size="lg" />;

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={navigateState} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/tickets" replace />;
  }

  return <>{children}</>;
}
