import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useUnreadNotificationCount } from '@/hooks/use-notifications';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function Layout() {
  useUnreadNotificationCount();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar onMenuToggle={() => setSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6 lg:p-8 dark:bg-gray-900">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
