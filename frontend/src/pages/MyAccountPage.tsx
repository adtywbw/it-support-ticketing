import { useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useChangePassword } from '@/hooks/use-change-password';
import {
  useTelegramStatus,
  useTelegramConfig,
  useUpdateTelegramConfig,
  useGenerateTelegramCode,
  useUnlinkTelegram,
  type TelegramSettings,
} from '@/hooks/use-telegram';
import PasswordInput from '@/components/ui/PasswordInput';
import { getUserDisplayName, getUserInitials } from '@/lib/utils';

const EVENT_LABELS: Record<string, string> = {
  'ticket.created': 'New Ticket Created',
  'ticket.assigned': 'Ticket Assigned',
  'ticket.status.updated': 'Ticket Status Updated',
};

const EVENT_KEYS = Object.keys(EVENT_LABELS);

export default function MyAccountPage() {
  const user = useAuthStore((s) => s.user);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const changePasswordMutation = useChangePassword();

  const [showCode, setShowCode] = useState(false);
  const [linkCode, setLinkCode] = useState('');
  const telegramStatus = useTelegramStatus();
  const generateCode = useGenerateTelegramCode();
  const unlinkTelegram = useUnlinkTelegram();

  const telegramConfig = useTelegramConfig();
  const updateConfig = useUpdateTelegramConfig();

  const [botToken, setBotToken] = useState('');
  const [enabledEvents, setEnabledEvents] = useState<string[]>([]);
  const [enableGroupChat, setEnableGroupChat] = useState(false);
  const [groupChatId, setGroupChatId] = useState('');
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  if (telegramConfig.data && !configLoaded) {
    setBotToken('');
    setEnabledEvents(telegramConfig.data.settings.enabledEvents || []);
    setEnableGroupChat(telegramConfig.data.settings.enableGroupChat || false);
    setGroupChatId('');
    setTemplates(telegramConfig.data.settings.templates || {});
    setConfigLoaded(true);
  }

  const handleGenerateCode = async () => {
    const result = await generateCode.mutateAsync();
    setLinkCode(result.code);
    setShowCode(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    try {
      await changePasswordMutation.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password changed successfully.');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to change password';
      setError(msg);
    }
  };

  const toggleEvent = (event: string) => {
    setEnabledEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  const handleSaveConfig = async () => {
    const settings: TelegramSettings = {
      enabledEvents,
      enableGroupChat,
      templates,
    };
    if (enableGroupChat && groupChatId) {
      settings.groupChatId = groupChatId;
    }
    await updateConfig.mutateAsync({ botToken, settings });
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 3000);
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Account</h1>

      <div className="card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-100 text-lg font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
            {user ? getUserInitials(user) : '?'}
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {user ? getUserDisplayName(user) : 'User'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
            <span className="inline-block mt-1 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/20 dark:text-primary-300">
              {user?.role}
            </span>
          </div>
        </div>

        {user?.role !== 'EndUser' && (
          <>
            <hr className="my-6 border-gray-200 dark:border-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Change Password</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>
              )}
              {success && (
                <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">{success}</div>
              )}

              <div>
                <label className="label">Current Password</label>
                <PasswordInput
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label">New Password</label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <div>
                <label className="label">Confirm New Password</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? 'Changing Password...' : 'Change Password'}
              </button>
            </form>
          </>
        )}

        {user?.role === 'Admin' && (
          <>
            <hr className="my-6 border-gray-200 dark:border-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Telegram</h2>

            {telegramStatus.data?.linked ? (
              <div className="space-y-3 mb-6">
                <p className="text-sm text-green-600 dark:text-green-400">
                  Connected to Telegram
                </p>
                <button
                  onClick={() => unlinkTelegram.mutate()}
                  className="btn-secondary"
                  disabled={unlinkTelegram.isPending}
                >
                  {unlinkTelegram.isPending ? 'Unlinking...' : 'Unlink Telegram'}
                </button>
              </div>
            ) : (
              <div className="space-y-3 mb-6">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Get ticket notifications on Telegram.
                </p>
                {!showCode ? (
                  <button
                    onClick={handleGenerateCode}
                    className="btn-primary"
                    disabled={generateCode.isPending}
                  >
                    {generateCode.isPending ? 'Generating...' : 'Link Telegram'}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Send this code to the bot:
                    </p>
                    <div className="inline-block rounded-lg bg-gray-100 px-4 py-2 font-mono text-lg font-bold tracking-wider dark:bg-gray-800">
                      {linkCode}
                    </div>
                    <p className="text-xs text-gray-500">
                      1. Open Telegram and search for <strong>@your_bot_username</strong>
                      <br />
                      2. Send <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">/start {linkCode}</code>
                      <br />
                      3. Expires in 5 minutes
                    </p>
                    <button
                      onClick={() => setShowCode(false)}
                      className="text-sm text-primary-600 hover:text-primary-700"
                    >
                      Generate new code
                    </button>
                  </div>
                )}
              </div>
            )}

            <hr className="my-6 border-gray-200 dark:border-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Bot Settings
            </h2>

            <div className="space-y-4">
              <div>
                <label className="label">Bot Token</label>
                <input
                  type="password"
                  className="input"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder={telegramConfig.data?.hasBotToken ? 'Token configured' : 'TELEGRAM_BOT_TOKEN'}
                />
              </div>

              <div>
                <label className="label">Notification Events</label>
                <div className="space-y-2 mt-1">
                  {EVENT_KEYS.map((event) => (
                    <label key={event} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabledEvents.includes(event)}
                        onChange={() => toggleEvent(event)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {EVENT_LABELS[event]}
                      </span>
                    </label>
                  ))}

                  <label className="flex items-center gap-2 cursor-pointer pt-2 border-t border-gray-200 dark:border-gray-700">
                    <input
                      type="checkbox"
                      checked={enableGroupChat}
                      onChange={(e) => setEnableGroupChat(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Send to Group Chat
                    </span>
                  </label>
                </div>
              </div>

              {enableGroupChat && (
                <div>
                  <label className="label">Group Chat ID</label>
                  <input
                    type="text"
                    className="input"
                    value={groupChatId}
                    onChange={(e) => setGroupChatId(e.target.value)}
                    placeholder={telegramConfig.data?.hasGroupChatId ? 'Group ID configured' : '-1001234567890'}
                  />
                </div>
              )}

              <div>
                <label className="label">Message Templates</label>
                <p className="text-xs text-gray-500 mb-2">
                  Available variables: {'{ticketNumber}'}, {'{subject}'}, {'{priority}'}, {'{createdBy}'}, {'{oldStatus}'}, {'{newStatus}'}, {'{assignedBy}'}, {'{url}'}
                </p>
                <div className="space-y-3">
                  {EVENT_KEYS.map((event) => (
                    <div key={event}>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                        {EVENT_LABELS[event]}
                      </label>
                      <textarea
                        className="input font-mono text-xs h-20"
                        value={templates[event] || ''}
                        onChange={(e) =>
                          setTemplates((prev) => ({ ...prev, [event]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSaveConfig}
                className="btn-primary w-full"
                disabled={updateConfig.isPending}
              >
                {updateConfig.isPending ? 'Saving...' : 'Save Settings'}
              </button>

              {configSaved && (
                <p className="text-sm text-green-600 dark:text-green-400 text-center">
                  Settings saved successfully.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
