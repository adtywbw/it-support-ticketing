import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  useTelegramStatus,
  useTelegramConfig,
  useUpdateTelegramConfig,
  useGenerateTelegramCode,
  useUnlinkTelegram,
  useSendTestNotification,
  useCheckTelegram,
} from "@/hooks/use-telegram";
import type { TelegramSettings, TelegramCheckResult } from "@/types";
import { getErrorMessage } from "@/lib/utils";

const EVENT_LABELS: Record<string, string> = {
  "ticket.created": "New Ticket Created",
  "ticket.assigned": "Ticket Assigned",
  "ticket.status.updated": "Ticket Status Updated",
};

const EVENT_KEYS = Object.keys(EVENT_LABELS);

export default function TelegramConfigSection() {
  const telegramStatus = useTelegramStatus({ enabled: true });
  const telegramConfig = useTelegramConfig({ enabled: true });
  const updateConfig = useUpdateTelegramConfig();
  const generateCode = useGenerateTelegramCode();
  const unlinkTelegram = useUnlinkTelegram();
  const sendTestNotification = useSendTestNotification();
  const checkTelegram = useCheckTelegram();

  const [showCode, setShowCode] = useState(false);
  const [linkCode, setLinkCode] = useState("");

  const [botToken, setBotToken] = useState("");
  const [botTokenTouched, setBotTokenTouched] = useState(false);
  const [enabledEvents, setEnabledEvents] = useState<string[]>([]);
  const [enableGroupChat, setEnableGroupChat] = useState(false);
  const [notifyIndividualsWhenGroupChat, setNotifyIndividualsWhenGroupChat] =
    useState(false);
  const [groupChatId, setGroupChatId] = useState("");
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [checkResult, setCheckResult] = useState<TelegramCheckResult | null>(
    null,
  );
  const [initialConfig, setInitialConfig] = useState<{
    enabledEvents: string[];
    enableGroupChat: boolean;
    notifyIndividualsWhenGroupChat: boolean;
    templates: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    if (!telegramConfig.data || configLoaded) return;

    // Initialize form state from fetched config once.
    // This effect intentionally calls setState synchronously to hydrate
    // the form on first load — a shared state key pattern, not cascading.
    setInitialConfig({
      enabledEvents: telegramConfig.data.settings.enabledEvents || [],
      enableGroupChat: telegramConfig.data.settings.enableGroupChat || false,
      notifyIndividualsWhenGroupChat:
        telegramConfig.data.settings.notifyIndividualsWhenGroupChat || false,
      templates: telegramConfig.data.settings.templates || {},
    });
    setBotToken("");
    setBotTokenTouched(false);
    setEnabledEvents(telegramConfig.data.settings.enabledEvents || []);
    setEnableGroupChat(telegramConfig.data.settings.enableGroupChat || false);
    setNotifyIndividualsWhenGroupChat(
      telegramConfig.data.settings.notifyIndividualsWhenGroupChat || false,
    );
    setGroupChatId("");
    setTemplates(telegramConfig.data.settings.templates || {});
    setConfigLoaded(true);
  }, [configLoaded, telegramConfig.data]);

  const handleGenerateCode = async () => {
    try {
      const result = await generateCode.mutateAsync();
      setLinkCode(result.code);
      setShowCode(true);
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(err, "Failed to generate Telegram link code"),
      );
    }
  };

  const handleCheck = async () => {
    setCheckResult(null);
    try {
      const result = await checkTelegram.mutateAsync({
        botToken,
        groupChatId: enableGroupChat ? groupChatId : undefined,
      });
      setCheckResult(result);
      if (result.bot.valid && (!result.groupChat || result.groupChat.valid)) {
        toast.success("Configuration looks good!");
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to check configuration"));
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
      notifyIndividualsWhenGroupChat,
      templates,
    };
    if (enableGroupChat) {
      settings.groupChatId = groupChatId || undefined;
    }
    try {
      await updateConfig.mutateAsync({
        ...(botTokenTouched ? { botToken } : {}),
        settings,
      });
      setInitialConfig({
        enabledEvents: settings.enabledEvents,
        enableGroupChat: settings.enableGroupChat,
        notifyIndividualsWhenGroupChat: settings.notifyIndividualsWhenGroupChat,
        templates: settings.templates,
      });
      setBotToken("");
      setBotTokenTouched(false);
      setGroupChatId("");
      setCheckResult(null);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(err, "Failed to save Telegram configuration"),
      );
    }
  };

  const checkHasError =
    checkResult &&
    (!checkResult.bot.valid ||
      (checkResult.groupChat && !checkResult.groupChat.valid));

  const init = initialConfig;
  const hasChanges =
    init &&
    (botTokenTouched ||
      groupChatId !== "" ||
      enableGroupChat !== init.enableGroupChat ||
      notifyIndividualsWhenGroupChat !== init.notifyIndividualsWhenGroupChat ||
      JSON.stringify([...enabledEvents].sort()) !==
        JSON.stringify([...init.enabledEvents].sort()) ||
      JSON.stringify(templates) !== JSON.stringify(init.templates));

  return (
    <>
      <hr className="my-6 border-blue-100 dark:border-navy-800" />
      <h2 className="text-lg font-semibold text-navy-950 dark:text-blue-50 mb-4">
        Telegram
      </h2>

      {telegramStatus.data?.linked ? (
        <div className="space-y-3 mb-6">
          <p className="text-sm text-green-600 dark:text-green-400">
            Connected to Telegram
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => unlinkTelegram.mutate()}
              className="btn-secondary"
              disabled={unlinkTelegram.isPending}
            >
              {unlinkTelegram.isPending ? "Unlinking..." : "Unlink Telegram"}
            </button>
            <button
              onClick={async () => {
                try {
                  await sendTestNotification.mutateAsync();
                  toast.success("Test notification sent!");
                } catch (err: unknown) {
                  toast.error(
                    getErrorMessage(err, "Failed to send test notification"),
                  );
                }
              }}
              className="btn-secondary"
              disabled={sendTestNotification.isPending}
            >
              {sendTestNotification.isPending
                ? "Sending..."
                : "Test Notification"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          <p className="text-sm text-navy-600 dark:text-blue-300">
            Get ticket notifications on Telegram.
          </p>
          {!showCode ? (
            <button
              onClick={handleGenerateCode}
              className="btn-primary"
              disabled={generateCode.isPending}
            >
              {generateCode.isPending ? "Generating..." : "Link Telegram"}
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-navy-700 dark:text-blue-200">
                Send this code to the bot:
              </p>
              <div className="inline-block rounded-lg bg-blue-50 px-4 py-2 font-mono text-lg font-bold tracking-wider dark:bg-navy-900">
                {linkCode}
              </div>
              <p className="text-xs text-navy-500 dark:text-blue-300">
                1. Open Telegram and search for{" "}
                <strong>@your_bot_username</strong>
                <br />
                2. Send{" "}
                <code className="bg-blue-50 dark:bg-navy-900 px-1 rounded">
                  /start {linkCode}
                </code>
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

      <hr className="my-6 border-blue-100 dark:border-navy-800" />
      <h2 className="text-lg font-semibold text-navy-950 dark:text-blue-50 mb-4">
        Bot Settings
      </h2>

      <div className="space-y-4">
        <div>
          <label className="label">Bot Token</label>
          <div className="flex gap-2">
            <input
              type="password"
              className="input flex-1"
              value={botToken}
              onChange={(e) => {
                setBotToken(e.target.value);
                setBotTokenTouched(true);
                setCheckResult(null);
              }}
              placeholder={
                telegramConfig.data?.hasBotToken
                  ? "Token configured"
                  : "TELEGRAM_BOT_TOKEN"
              }
            />
            <button
              onClick={handleCheck}
              className="btn-secondary whitespace-nowrap"
              disabled={checkTelegram.isPending}
            >
              {checkTelegram.isPending ? "Checking..." : "Check"}
            </button>
          </div>
          {checkResult && (
            <div className="mt-1 space-y-1">
              <div className="flex items-center gap-1.5 text-xs">
                {checkResult.bot.valid ? (
                  <>
                    <span className="text-green-600 dark:text-green-400">
                      ✅
                    </span>
                    <span className="text-green-600 dark:text-green-400">
                      Bot @{checkResult.bot.username} valid
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-red-600 dark:text-red-400">❌</span>
                    <span className="text-red-600 dark:text-red-400">
                      {checkResult.bot.error}
                    </span>
                  </>
                )}
              </div>
              {checkResult.groupChat && (
                <div className="flex items-center gap-1.5 text-xs">
                  {checkResult.groupChat.valid ? (
                    <>
                      <span className="text-green-600 dark:text-green-400">
                        ✅
                      </span>
                      <span className="text-green-600 dark:text-green-400">
                        Group {checkResult.groupChat.title} (
                        {checkResult.groupChat.type}) found
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-red-600 dark:text-red-400">❌</span>
                      <span className="text-red-600 dark:text-red-400">
                        {checkResult.groupChat.error}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="label">Notification Events</label>
          <div className="space-y-2 mt-1">
            {EVENT_KEYS.map((event) => (
              <label
                key={event}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={enabledEvents.includes(event)}
                  onChange={() => toggleEvent(event)}
                  className="h-4 w-4 rounded border-blue-200 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-navy-700 dark:text-blue-200">
                  {EVENT_LABELS[event]}
                </span>
              </label>
            ))}

            <label className="flex items-center gap-2 cursor-pointer pt-2 border-t border-blue-100 dark:border-navy-800">
              <input
                type="checkbox"
                checked={enableGroupChat}
                onChange={(e) => {
                  setEnableGroupChat(e.target.checked);
                  setCheckResult(null);
                }}
                className="h-4 w-4 rounded border-blue-200 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-navy-700 dark:text-blue-200">
                Send to Group Chat
              </span>
            </label>
          </div>
        </div>

        {enableGroupChat && (
          <>
            <label className="flex items-center gap-2 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={notifyIndividualsWhenGroupChat}
                onChange={(e) => {
                  setNotifyIndividualsWhenGroupChat(e.target.checked);
                  setCheckResult(null);
                }}
                className="h-4 w-4 rounded border-blue-200 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-navy-700 dark:text-blue-200">
                Also notify individually
              </span>
            </label>
            <div>
              <label className="label">Group Chat ID</label>
              <input
                type="text"
                className="input"
                value={groupChatId}
                onChange={(e) => {
                  setGroupChatId(e.target.value);
                  setCheckResult(null);
                }}
                placeholder={
                  telegramConfig.data?.hasGroupChatId
                    ? "Group ID configured"
                    : "-1001234567890"
                }
              />
              {checkResult?.groupChat && !checkResult.groupChat.valid && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  Fix the Group Chat ID error above before saving
                </p>
              )}
            </div>
          </>
        )}

        <div>
          <label className="label">Message Templates</label>
          <p className="text-xs text-navy-500 dark:text-blue-300 mb-2">
            Available variables: {"{ticketNumber}"}, {"{subject}"},{" "}
            {"{priority}"}, {"{createdBy}"}, {"{oldStatus}"}, {"{newStatus}"},{" "}
            {"{assignedBy}"}, {"{url}"}
          </p>
          <div className="space-y-3">
            {EVENT_KEYS.map((event) => (
              <div key={event}>
                <label className="text-xs font-medium text-navy-600 dark:text-blue-300 mb-1 block">
                  {EVENT_LABELS[event]}
                </label>
                <textarea
                  className="input font-mono text-xs h-20"
                  value={templates[event] || ""}
                  onChange={(e) =>
                    setTemplates((prev) => ({
                      ...prev,
                      [event]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleSaveConfig}
          className="btn-primary w-full"
          disabled={updateConfig.isPending || (!hasChanges && !!checkHasError)}
        >
          {updateConfig.isPending ? "Saving..." : "Save Settings"}
        </button>

        {checkHasError && !hasChanges && (
          <p className="text-xs text-red-600 dark:text-red-400 text-center">
            Fix the errors shown above or change the settings to save
          </p>
        )}

        {configSaved && (
          <p className="text-sm text-green-600 dark:text-green-400 text-center">
            Settings saved successfully.
          </p>
        )}
      </div>
    </>
  );
}
