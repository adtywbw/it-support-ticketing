import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from '@/layout/Layout';
import ProtectedRoute from '@/auth/ProtectedRoute';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import MaintenanceBanner from '@/components/MaintenanceBanner';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import TicketsPage from '@/pages/TicketsPage';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const CreateTicketPage = lazy(() => import('@/pages/CreateTicketPage'));
const TicketDetailPage = lazy(() => import('@/pages/TicketDetailPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const MyAccountPage = lazy(() => import('@/pages/MyAccountPage'));
const AdminUsersPage = lazy(() => import('@/pages/AdminUsersPage'));
const AdminMasterDataPage = lazy(() => import('@/pages/AdminMasterDataPage'));
const AdminMaintenancePage = lazy(() => import('@/pages/AdminMaintenancePage'));

const SuspenseFallback = () => (
  <div className="flex min-h-screen items-center justify-center">
    <LoadingSpinner size="lg" />
  </div>
);

export default function App() {
  return (
    <ErrorBoundary>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: '8px',
            background: '#333',
            color: '#fff',
            fontSize: '14px',
          },
        }}
      />
      <MaintenanceBanner />
      <Suspense fallback={<SuspenseFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/tickets" replace />} />

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['ITSupport', 'Admin']}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route
            path="/tickets/new"
            element={
              <ProtectedRoute allowedRoles={['EndUser', 'ITSupport', 'Admin']}>
                <CreateTicketPage />
              </ProtectedRoute>
            }
          />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/my-account" element={<MyAccountPage />} />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <AdminUsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/master-data"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <AdminMasterDataPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/maintenance"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <AdminMaintenancePage />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/tickets" replace />} />
      </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
