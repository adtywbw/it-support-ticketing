import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from '@/layout/Layout';
import ProtectedRoute from '@/auth/ProtectedRoute';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import LoginPage from '@/pages/LoginPage';
import TicketsPage from '@/pages/TicketsPage';
import CreateTicketPage from '@/pages/CreateTicketPage';
import TicketDetailPage from '@/pages/TicketDetailPage';
import DashboardPage from '@/pages/DashboardPage';
import NotificationsPage from '@/pages/NotificationsPage';
import MyAccountPage from '@/pages/MyAccountPage';
import AdminUsersPage from '@/pages/AdminUsersPage';
import AdminMasterDataPage from '@/pages/AdminMasterDataPage';
import AdminMaintenancePage from '@/pages/AdminMaintenancePage';

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
      <Routes>
        <Route path="/login" element={<LoginPage />} />

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
              <ProtectedRoute allowedRoles={['ITSupport', 'Admin']}>
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

        <Route path="/" element={<Navigate to="/tickets" replace />} />
        <Route path="*" element={<Navigate to="/tickets" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
