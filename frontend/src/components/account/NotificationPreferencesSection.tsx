import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "@/hooks/use-notification-preferences";
import type { NotificationPreferencesMap } from "@/types";
import { getErrorMessage } from "@/lib/utils";

export default function NotificationPreferencesSection() {
  const { data, isLoading } = useNotificationPreferences();
  const updateMutation = useUpdateNotificationPreferences();

  const [preferences, setPreferences] = useState<NotificationPreferencesMap>(
    {},
  );
  const [loaded, setLoaded] = useState(false);
  const [initial, setInitial] = useState<NotificationPreferencesMap | null>(
    null,
  );

  useEffect(() => {
    if (!data || loaded) return;
    setInitial({ ...data.preferences });
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
      setInitial({ ...preferences });
      toast.success("Notification preferences saved.");
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(err, "Failed to save notification preferences"),
      );
    }
  };

  const hasChanges = initial
    ? JSON.stringify(preferences) !== JSON.stringify(initial)
    : false;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-5 w-48 animate-pulse rounded bg-blue-100 dark:bg-navy-800" />
        <div className="h-4 w-full animate-pulse rounded bg-blue-100 dark:bg-navy-800" />
      </div>
    );
  }

  return (
    <>
      <hr className="my-6 border-blue-100 dark:border-navy-800" />
      <h2 className="text-lg font-semibold text-navy-950 dark:text-blue-50 mb-2">
        Notification Preferences
      </h2>
      <p className="text-sm text-navy-600 dark:text-blue-300 mb-4">
        Choose which in-app notifications appear in your notification panel.
      </p>
      <div className="space-y-2">
        {(data?.availableEvents ?? []).map(({ event, label }) => (
          <label key={event} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences[event] ?? true}
              onChange={() => toggle(event)}
              className="h-4 w-4 rounded border-blue-200 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-navy-700 dark:text-blue-200">
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
        {updateMutation.isPending ? "Saving..." : "Save Preferences"}
      </button>
    </>
  );
}
