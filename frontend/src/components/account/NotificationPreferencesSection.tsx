import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks/use-notification-preferences';
import type { NotificationPreferencesMap } from '@/types';
import { getErrorMessage } from '@/lib/utils';

export default function NotificationPreferencesSection() {
  const { data, isLoading } = useNotificationPreferences();
  const updateMutation = useUpdateNotificationPreferences();

  const [preferences, setPreferences] = useState<NotificationPreferencesMap>(
    {},
  );
  const [loaded, setLoaded] = useState(false);
  const initialRef = useRef<NotificationPreferencesMap | null>(null);

  useEffect(() => {
    if (!data || loaded) return;
    initialRef.current = { ...data.preferences };
    setPreferences({ ...data.preferences });
    setLoaded(true);
  }, [data, loaded]);

  const toggle = (event: string) => {
    setPreferences((prev) => ({
      ...prev,
      [event]: !prev[event],
    }));
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync(preferences);
      initialRef.current = { ...preferences };
      toast.success('Notification preferences saved.');
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(err, 'Failed to save notification preferences'),
      );
    }
  };

  const hasChanges = initialRef.current
    ? JSON.stringify(preferences) !== JSON.stringify(initialRef.current)
    : false;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-5 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    );
  }

  return (
    <>
      <hr className="my-6 border-slate-200 dark:border-slate-700" />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
        Notification Preferences
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        Choose which in-app notifications appear in your notification panel.
      </p>
      <div className="space-y-2">
        {(data?.availableEvents ?? []).map(({ event, label }) => (
          <label
            key={event}
            className="flex items-center gap-2 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={preferences[event] ?? true}
              onChange={() => toggle(event)}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              {label}
            </span>
          </label>
        ))}
      </div>
      <button
        onClick={handleSave}
        className="btn-primary w-full mt-4"
        disabled={!hasChanges || updateMutation.isPending}
      >
        {updateMutation.isPending ? 'Saving...' : 'Save Preferences'}
      </button>
    </>
  );
}
