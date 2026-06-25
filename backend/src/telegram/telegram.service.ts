import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { TelegramConfigRepository } from '../common/repositories/telegram-config.repository';
import { UserRepository } from '../common/repositories/user.repository';

export interface TelegramSettings {
  enabledEvents: string[];
  enableGroupChat: boolean;
  groupChatId?: string;
  notifyIndividualsWhenGroupChat: boolean;
  templates: Record<string, string>;
}

const DEFAULT_TEMPLATES: Record<string, string> = {
  'ticket.created':
    '\uD83C\uDFAB New Ticket\n{ticketNumber}: {subject}\nPriority: {priority}\nCreated by: {createdBy}\n{url}',
  'ticket.assigned':
    '\uD83D\uDCCB Ticket Assigned\n{ticketNumber}: {subject}\nAssigned by: {assignedBy}\n{url}',
  'ticket.status.updated':
    '\uD83D\uDD04 Status Updated\n{ticketNumber}: {subject}\n{oldStatus} \u2192 {newStatus}\n{url}',
};

function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class TelegramService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TelegramService.name);
  private polling = false;

  constructor(
    private readonly telegramConfigRepository: TelegramConfigRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async onApplicationBootstrap() {
    await this.startBot();
  }

  async onApplicationShutdown() {
    this.polling = false;
  }

  async startBot() {
    this.polling = false;
    const token = await this.resolveToken();
    if (!token) {
      this.logger.warn('Telegram bot token not configured');
      return;
    }
    this.polling = true;
    this.logger.log('Telegram bot polling started');
    this.pollLoop(token, 0);
  }

  private async resolveToken(): Promise<string | null> {
    const config = await this.telegramConfigRepository.findFirst();
    if (config?.botToken) return config.botToken;
    return process.env.TELEGRAM_BOT_TOKEN || null;
  }

  private async resolveSettings(): Promise<TelegramSettings> {
    const config = await this.telegramConfigRepository.findFirst();
    const defaults: TelegramSettings = {
      enabledEvents: ['ticket.created'],
      enableGroupChat: false,
      groupChatId: process.env.TELEGRAM_GROUP_CHAT_ID || undefined,
      notifyIndividualsWhenGroupChat: false,
      templates: {},
    };
    if (config?.settings && typeof config.settings === 'object') {
      const s = config.settings as Record<string, unknown>;
      return {
        enabledEvents: (s.enabledEvents as string[]) || defaults.enabledEvents,
        enableGroupChat:
          (s.enableGroupChat as boolean) ?? defaults.enableGroupChat,
        groupChatId:
          (s.groupChatId as string) ||
          (!s.enableGroupChat ? undefined : defaults.groupChatId),
        notifyIndividualsWhenGroupChat:
          (s.notifyIndividualsWhenGroupChat as boolean) ?? defaults.notifyIndividualsWhenGroupChat,
        templates: {
          ...DEFAULT_TEMPLATES,
          ...((s.templates as Record<string, string>) || {}),
        },
      };
    }
    return defaults;
  }

  private async pollLoop(token: string, offset: number) {
    if (!this.polling) return;

    const TIMEOUT_SECONDS = 30;
    let hasUpdates = false;

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=${TIMEOUT_SECONDS}`,
      );
      const data = await res.json();

      if (data.ok && data.result) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          await this.handleUpdate(token, update);
          hasUpdates = true;
        }
      }
    } catch (err) {
      this.logger.error('Telegram polling error', err);
    }

    const delay = hasUpdates ? 0 : TIMEOUT_SECONDS * 1000;
    setTimeout(() => this.pollLoop(token, offset), delay);
  }

  private async handleUpdate(token: string, update: any) {
    const msg = update.message;
    if (!msg?.text) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();

    if (text.startsWith('/start ')) {
      const code = text.slice(7).trim();
      if (!code || code.length !== 6) {
        await this.sendMessage(token, chatId, 'Invalid link code.');
        return;
      }

      const user = await this.userRepository.findWithTelegramCode(code);

      if (!user) {
        await this.sendMessage(
          token,
          chatId,
          'Link code expired or invalid. Please generate a new one from My Account.',
        );
        return;
      }

      await this.userRepository.update(user.id, {
        telegramChatId: String(chatId),
        telegramCode: null,
        telegramCodeAt: null,
      });

      await this.sendMessage(
        token,
        chatId,
        `Successfully linked to ${user.email}! You will now receive ticket notifications.`,
      );
    }
  }

  async sendMessage(token: string, chatId: number, text: string) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
    } catch (err) {
      this.logger.error(`Failed to send Telegram message to ${chatId}`, err);
    }
  }

  async getConfig() {
    let config = await this.telegramConfigRepository.findFirst();
    if (!config) {
      config = await this.telegramConfigRepository.create({ settings: {} });
    }
    const settings = config.settings as unknown as TelegramSettings;
    const { groupChatId: _, ...safeSettings } = settings;
    return {
      botToken: '',
      hasBotToken: !!config.botToken,
      hasGroupChatId: !!settings.groupChatId,
      settings: safeSettings,
    };
  }

  async updateConfig(data: {
    botToken?: string;
    settings?: TelegramSettings;
  }) {
    let config = await this.telegramConfigRepository.findFirst();
    if (!config) {
      config = await this.telegramConfigRepository.create({ settings: {} });
    }

    const update: Record<string, unknown> = {};
    if (data.botToken !== undefined) {
      if (data.botToken) {
        update.botToken = data.botToken;
      } else {
        update.botToken = null;
      }
    }
    if (data.settings) {
      const existingSettings = (config?.settings as Record<string, unknown>) || {};
      const merged: Record<string, unknown> = {
        enabledEvents: data.settings.enabledEvents,
        enableGroupChat: data.settings.enableGroupChat,
        notifyIndividualsWhenGroupChat: data.settings.notifyIndividualsWhenGroupChat,
        templates: { ...DEFAULT_TEMPLATES, ...(data.settings.templates || {}) },
      };
      if (data.settings.groupChatId !== undefined) {
        merged.groupChatId = data.settings.groupChatId || undefined;
      } else if (existingSettings.groupChatId && data.settings.enableGroupChat) {
        merged.groupChatId = existingSettings.groupChatId;
      }
      update.settings = merged;
    }

    await this.telegramConfigRepository.update(config.id, update);
    await this.startBot();

    return this.getConfig();
  }

  renderMessage(
    event: string,
    vars: Record<string, string>,
    settings: TelegramSettings,
  ): string {
    const template =
      settings.templates?.[event] || DEFAULT_TEMPLATES[event] || '';
    let msg = template;
    for (const [key, val] of Object.entries(vars)) {
      msg = msg.replace(new RegExp(`\\{${key}\\}`, 'g'), escapeTelegramHtml(val || ''));
    }
    return msg;
  }

  async sendEvent(
    event: string,
    vars: Record<string, string>,
  ) {
    const token = await this.resolveToken();
    if (!token) return;

    const settings = await this.resolveSettings();
    if (!settings.enabledEvents.includes(event)) return;

    const message = this.renderMessage(event, vars, settings);

    if (settings.enableGroupChat && settings.groupChatId) {
      await this.sendMessage(token, Number(settings.groupChatId), message);
      if (!settings.notifyIndividualsWhenGroupChat) return;
    }

    const users = await this.userRepository.findTelegramLinkedUsers();

    for (const user of users) {
      if (user.telegramChatId) {
        await this.sendMessage(token, Number(user.telegramChatId), message);
      }
    }
  }

  async sendToUser(userId: string, message: string) {
    const token = await this.resolveToken();
    if (!token) return;

    const user = await this.userRepository.getTelegramChatId(userId);

    if (user?.telegramChatId) {
      await this.sendMessage(token, Number(user.telegramChatId), message);
    }
  }

  async checkConfig(botToken?: string, groupChatId?: string) {
    const token = botToken || (await this.resolveToken());

    const result: {
      bot: { valid: boolean; username?: string; firstName?: string; error?: string };
      groupChat: { valid: boolean; title?: string; type?: string; error?: string } | null;
    } = { bot: { valid: false }, groupChat: null };

    if (!token) {
      result.bot.error = 'Bot token not configured';
      return result;
    }

    if (!groupChatId) {
      const settings = await this.resolveSettings();
      if (settings.enableGroupChat && settings.groupChatId) {
        groupChatId = settings.groupChatId;
      }
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        result.bot.error = `Telegram API error (${res.status}): ${body?.description || 'Unknown error'}`;
      } else {
        const data = await res.json();
        result.bot = {
          valid: true,
          username: data.result?.username,
          firstName: data.result?.first_name,
        };
      }
    } catch (err) {
      result.bot.error = err instanceof Error ? err.message : 'Unknown error';
    }

    if (groupChatId) {
      result.groupChat = { valid: false };
      try {
        const chatRes = await fetch(
          `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(groupChatId)}`,
        );
        if (!chatRes.ok) {
          const body = await chatRes.json().catch(() => ({}));
          result.groupChat.error = `Telegram API error (${chatRes.status}): ${body?.description || 'Unknown error'}`;
        } else {
          const data = await chatRes.json();
          const chatInfo = {
            title: data.result?.title || data.result?.first_name || 'Chat found',
            type: data.result?.type,
          };

          const actionRes = await fetch(
            `https://api.telegram.org/bot${token}/sendChatAction`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: groupChatId, action: 'typing' }),
            },
          );

          if (actionRes.ok) {
            result.groupChat = { valid: true, ...chatInfo };
          } else {
            const body = await actionRes.json().catch(() => ({}));
            result.groupChat = {
              valid: false,
              error: `Telegram API error (${actionRes.status}): ${body?.description || 'Chat is not reachable'}`,
            };
          }
        }
      } catch (err) {
        result.groupChat.error = err instanceof Error ? err.message : 'Unknown error';
      }
    }

    return result;
  }

  private async sendMessageSafe(token: string, chatId: number, text: string) {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new BadRequestException(
        `Telegram API error (${res.status}): ${body?.description || 'Unknown error'}`,
      );
    }
  }

  async sendTestNotification(userId: string) {
    const token = await this.resolveToken();
    if (!token) {
      throw new BadRequestException('Telegram bot token is not configured. Set a token in Bot Settings or TELEGRAM_BOT_TOKEN env.');
    }

    const settings = await this.resolveSettings();
    const message =
      'This is a test notification from your IT Support Ticketing system. If you receive this, your Telegram integration is working correctly!';

    let groupSent = false;

    if (settings.enableGroupChat && settings.groupChatId) {
      try {
        await this.sendMessageSafe(token, Number(settings.groupChatId), message);
        groupSent = true;
        if (!settings.notifyIndividualsWhenGroupChat) return;
      } catch (err) {
        this.logger.warn(
          `Test notification group chat failed: ${err instanceof BadRequestException ? err.message : 'Unknown error'}`,
        );
      }
    }

    const user = await this.userRepository.getTelegramChatId(userId);

    if (!user?.telegramChatId) {
      if (groupSent) return;
      throw new BadRequestException('Your Telegram account is not linked. Please link your Telegram account first.');
    }

    await this.sendMessageSafe(token, Number(user.telegramChatId), message);
  }

  async generateLinkCode(userId: string): Promise<string> {
    const bytes = crypto.randomBytes(5);
    const code = bytes.toString('base64url').substring(0, 10).toUpperCase();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.userRepository.update(userId, {
      telegramCode: code,
      telegramCodeAt: expiresAt,
    });

    return code;
  }

  async unlink(userId: string) {
    await this.userRepository.update(userId, {
      telegramChatId: null,
      telegramCode: null,
      telegramCodeAt: null,
    });
  }

  async getStatus(userId: string) {
    const user = await this.userRepository.getTelegramChatId(userId);
    return { linked: !!user?.telegramChatId };
  }
}
