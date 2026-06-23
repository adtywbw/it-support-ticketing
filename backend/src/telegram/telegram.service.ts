import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class TelegramService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TelegramService.name);
  private polling = false;

  constructor(private readonly prisma: PrismaService) {}

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
    const config = await this.prisma.telegramConfig.findFirst();
    if (config?.botToken) return config.botToken;
    return process.env.TELEGRAM_BOT_TOKEN || null;
  }

  private async resolveSettings(): Promise<TelegramSettings> {
    const config = await this.prisma.telegramConfig.findFirst();
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

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=30`,
      );
      const data = await res.json();

      if (data.ok && data.result) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          await this.handleUpdate(token, update);
        }
      }
    } catch (err) {
      this.logger.error('Telegram polling error', err);
    }

    setTimeout(() => this.pollLoop(token, offset), 100);
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

      const user = await this.prisma.user.findFirst({
        where: {
          telegramCode: code,
          telegramCodeAt: { gte: new Date() },
        },
      });

      if (!user) {
        await this.sendMessage(
          token,
          chatId,
          'Link code expired or invalid. Please generate a new one from My Account.',
        );
        return;
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          telegramChatId: String(chatId),
          telegramCode: null,
          telegramCodeAt: null,
        },
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
    let config = await this.prisma.telegramConfig.findFirst();
    if (!config) {
      config = await this.prisma.telegramConfig.create({
        data: { settings: {} },
      });
    }
    const settings = config.settings as unknown as TelegramSettings;
    return {
      botToken: '',
      hasBotToken: !!config.botToken,
      hasGroupChatId: !!settings.groupChatId,
      settings,
    };
  }

  async updateConfig(data: {
    botToken?: string;
    settings?: TelegramSettings;
  }) {
    let config = await this.prisma.telegramConfig.findFirst();
    if (!config) {
      config = await this.prisma.telegramConfig.create({ data: {} });
    }

    const update: Record<string, unknown> = {};
    if (data.botToken !== undefined) {
      if (data.botToken) {
        update.botToken = data.botToken;
      }
    }
    if (data.settings) {
      const merged: Record<string, unknown> = {
        enabledEvents: data.settings.enabledEvents,
        enableGroupChat: data.settings.enableGroupChat,
        notifyIndividualsWhenGroupChat: data.settings.notifyIndividualsWhenGroupChat,
        templates: { ...DEFAULT_TEMPLATES, ...(data.settings.templates || {}) },
      };
      if (data.settings.groupChatId) {
        merged.groupChatId = data.settings.groupChatId;
      }
      update.settings = merged;
    }

    await this.prisma.telegramConfig.update({
      where: { id: config.id },
      data: update,
    });

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
      msg = msg.replace(new RegExp(`\\{${key}\\}`, 'g'), val || '');
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

    const users = await this.prisma.user.findMany({
      where: {
        role: { in: ['ITSupport', 'Admin'] },
        isActive: true,
        telegramChatId: { not: null },
      },
      select: { telegramChatId: true },
    });

    for (const user of users) {
      if (user.telegramChatId) {
        await this.sendMessage(token, Number(user.telegramChatId), message);
      }
    }
  }

  async sendToUser(userId: string, message: string) {
    const token = await this.resolveToken();
    if (!token) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });

    if (user?.telegramChatId) {
      await this.sendMessage(token, Number(user.telegramChatId), message);
    }
  }

  async generateLinkCode(userId: string): Promise<string> {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: userId },
      data: { telegramCode: code, telegramCodeAt: expiresAt },
    });

    return code;
  }

  async unlink(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        telegramChatId: null,
        telegramCode: null,
        telegramCodeAt: null,
      },
    });
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });
    return { linked: !!user?.telegramChatId };
  }
}
