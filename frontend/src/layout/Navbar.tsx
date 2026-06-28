import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient, { unwrapData, type ApiEnvelope } from '@/lib/axios';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useThemeStore } from '@/stores/theme-store';
import { useMarkAsRead, useMarkAllAsRead, useClearAll } from '@/hooks/use-notifications';
import { useLogout } from '@/hooks/use-auth';
import { formatRelativeTime, getUserDisplayName, getUserInitials } from '@/lib/utils';
import type { Notification } from '@/types';

interface NavbarProps {
  onMenuToggle: () => void;
}

export default function Navbar({ onMenuToggle }: NavbarProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { mode, setMode } = useThemeStore();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const clearAll = useClearAll();
  const logoutMutation = useLogout();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['notifications', 'dropdown'],
    enabled: notifOpen,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<Notification[]>>('/notifications?page=1&limit=5');
      return unwrapData(res);
    },
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = (notif: Notification) => {
    if (!notif.isRead) {
      markAsRead.mutate(notif.id);
    }
    setNotifOpen(false);
    const ticketId = notif.data && 'ticketId' in notif.data ? (notif.data as Record<string, string>).ticketId : null;
    if (ticketId) {
      navigate(`/tickets/${ticketId}`);
    }
  };

  const themeOptions = [
    { value: 'light' as const, label: 'Light Mode', icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
      </svg>
    ) },
    { value: 'dark' as const, label: 'Dark Mode', icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
      </svg>
    ) },
  ];

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center border-b border-gray-200 bg-white px-4 sm:px-6 dark:border-gray-700 dark:bg-gray-800">
      <button
        onClick={onMenuToggle}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:hidden dark:hover:bg-gray-700 dark:hover:text-gray-300"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      <div className="ml-auto flex items-center gap-4">
        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
              <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</p>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {!data || data.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No notifications</p>
                ) : (
                  data.map((notif) => (
                    <button
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`w-full text-left px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                        !notif.isRead ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''
                      }`}
                    >
                      <p className={`text-sm ${!notif.isRead ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                        {notif.title}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{notif.message}</p>
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{formatRelativeTime(notif.createdAt)}</p>
                    </button>
                  ))
                )}
              </div>
              <div className="border-t border-gray-200 px-4 py-2 dark:border-gray-700">
                <button
                  onClick={() => { setNotifOpen(false); navigate('/notifications'); }}
                  className="w-full rounded-lg py-1.5 text-center text-sm text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
                >
                  See all notifications
                </button>
                {data && data.length > 0 && (
                  <button
                    onClick={() => clearAll.mutate()}
                    disabled={clearAll.isPending}
                    className="w-full rounded-lg py-1.5 text-center text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700/50"
                  >
                    {clearAll.isPending ? 'Clearing...' : 'Clear all'}
                  </button>
                )}
                {data && data.some((n) => !n.isRead) && (
                  <button
                    onClick={() => markAllAsRead.mutate()}
                    disabled={markAllAsRead.isPending}
                    className="w-full rounded-lg py-1.5 text-center text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700/50"
                  >
                    {markAllAsRead.isPending ? 'Marking...' : 'Mark all as read'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 rounded-lg p-1.5 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600 dark:bg-gray-600 dark:text-gray-300">
              {user ? getUserInitials(user) : '?'}
            </div>
            <span className="hidden sm:inline text-sm font-medium">{user ? getUserDisplayName(user) : 'User'}</span>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
              <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{user ? getUserDisplayName(user) : 'User'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
              </div>

              <button
                onClick={() => { setProfileOpen(false); navigate('/my-account'); }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50 flex items-center gap-3"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                My Account
              </button>

              <div className="border-t border-gray-200 dark:border-gray-700">
                <div className="px-4 py-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Appearance</p>
                </div>
                {themeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setMode(opt.value); setProfileOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${
                      mode === opt.value
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    {opt.icon}
                    <span className="flex-1">{opt.label}</span>
                    {mode === opt.value && (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => { setProfileOpen(false); logoutMutation.mutate(); }}
                  disabled={logoutMutation.isPending}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 flex items-center gap-3"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                  {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
