import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/axios';
import { useNotificationStore } from '@/stores/notification-store';
import { useMarkAsRead, useMarkAllAsRead } from '@/hooks/use-notifications';
import { formatRelativeTime } from '@/lib/utils';
import type { Notification, PaginatedResponse } from '@/types';

interface NavbarProps {
  onMenuToggle: () => void;
}

export default function Navbar({ onMenuToggle }: NavbarProps) {
  const navigate = useNavigate();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['notifications', 'dropdown'],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Notification>>('/notifications?page=1&limit=5');
      return res.data.data;
    },
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = (notif: Notification) => {
    if (!notif.isRead) {
      markAsRead.mutate(notif.id);
    }
    setIsOpen(false);
    const ticketId = notif.data && 'ticketId' in notif.data ? (notif.data as Record<string, string>).ticketId : null;
    if (ticketId) {
      navigate(`/tickets/${ticketId}`);
    }
  };

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
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
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

          {isOpen && (
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
                  onClick={() => { setIsOpen(false); navigate('/notifications'); }}
                  className="w-full rounded-lg py-1.5 text-center text-sm text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
                >
                  See all notifications
                </button>
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
      </div>
    </header>
  );
}
