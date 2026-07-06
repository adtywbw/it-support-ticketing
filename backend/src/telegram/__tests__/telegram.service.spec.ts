import { Test, TestingModule } from '@nestjs/testing';
import { TelegramService } from '../telegram.service';
import { TelegramConfigRepository } from '../../common/repositories/telegram-config.repository';
import { UserRepository } from '../../common/repositories/user.repository';
import { BadRequestException } from '@nestjs/common';
import { appConfig } from '../../common/config/app.config';

jest.mock('crypto', () => ({
  randomBytes: jest.fn(),
}));

const crypto = require('crypto');

describe('TelegramService', () => {
  let service: TelegramService;
  let telegramConfigRepository: any;
  let userRepository: any;

  const defaultSettings = {
    enabledEvents: ['ticket.created'],
    enableGroupChat: false,
    groupChatId: undefined,
    notifyIndividualsWhenGroupChat: false,
    templates: {
      'ticket.created': '\uD83C\uDFAB New Ticket\n{ticketNumber}: {subject}\nPriority: {priority}\nCreated by: {createdBy}\n{url}',
      'ticket.assigned': '\uD83D\uDCCB Ticket Assigned\n{ticketNumber}: {subject}\nAssigned by: {assignedBy}\n{url}',
      'ticket.status.updated': '\uD83D\uDD04 Status Updated\n{ticketNumber}: {subject}\n{oldStatus} \u2192 {newStatus}\n{url}',
    },
  };

  beforeEach(async () => {
    telegramConfigRepository = {
      findFirst: jest.fn(),
      findOrCreate: jest.fn(),
      update: jest.fn(),
    };
    userRepository = {
      update: jest.fn(),
      getTelegramChatId: jest.fn(),
      findTelegramLinkedUsers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        { provide: TelegramConfigRepository, useValue: telegramConfigRepository },
        { provide: UserRepository, useValue: userRepository },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateLinkCode()', () => {
    it('generates an 8-char base64url code and stores it with expiry', async () => {
      (crypto.randomBytes as jest.Mock).mockReturnValue(Buffer.from('abcdefgh'));
      jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00Z'));

      const code = await service.generateLinkCode('user-1');

      expect(code).toBe('YWJjZGVm');
      expect(crypto.randomBytes).toHaveBeenCalledWith(8);
      expect(userRepository.update).toHaveBeenCalledWith('user-1', {
        telegramCode: 'YWJjZGVm',
        telegramCodeAt: new Date(Date.now() + appConfig.telegram.linkCodeExpiryMin * 60 * 1000),
      });
      jest.useRealTimers();
    });
  });

  describe('unlink()', () => {
    it('clears telegramChatId, telegramCode, and telegramCodeAt', async () => {
      await service.unlink('user-1');

      expect(userRepository.update).toHaveBeenCalledWith('user-1', {
        telegramChatId: null,
        telegramCode: null,
        telegramCodeAt: null,
      });
    });
  });

  describe('getStatus()', () => {
    it('returns linked true when user has telegramChatId', async () => {
      userRepository.getTelegramChatId.mockResolvedValue({ telegramChatId: '12345' });

      const result = await service.getStatus('user-1');

      expect(result).toEqual({ linked: true });
    });

    it('returns linked false when user has no telegramChatId', async () => {
      userRepository.getTelegramChatId.mockResolvedValue({ telegramChatId: null });

      const result = await service.getStatus('user-1');

      expect(result).toEqual({ linked: false });
    });
  });

  describe('getConfig()', () => {
    it('returns sanitized config with hasBotToken flag', async () => {
      telegramConfigRepository.findOrCreate.mockResolvedValue({
        botToken: '123:abc',
        settings: {
          enabledEvents: ['ticket.created', 'ticket.assigned'],
          enableGroupChat: false,
          templates: {},
        },
      });

      const result = await service.getConfig();

      expect(telegramConfigRepository.findOrCreate).toHaveBeenCalledWith({ settings: {} });
      expect(result.hasBotToken).toBe(true);
      expect(result.hasGroupChatId).toBe(false);
      expect((result.settings as any).groupChatId).toBeUndefined();
      expect(result.settings.enabledEvents).toEqual(['ticket.created', 'ticket.assigned']);
    });

    it('returns hasGroupChatId true when groupChatId is set in settings', async () => {
      telegramConfigRepository.findOrCreate.mockResolvedValue({
        botToken: null,
        settings: {
          enabledEvents: ['ticket.created'],
          enableGroupChat: true,
          groupChatId: '-100123456',
          templates: {},
        },
      });

      const result = await service.getConfig();

      expect(result.hasBotToken).toBe(false);
      expect(result.hasGroupChatId).toBe(true);
      expect((result.settings as any).groupChatId).toBeUndefined();
    });
  });

  describe('updateConfig()', () => {
    const existingConfig = {
      botToken: 'old:token',
      settings: {
        enabledEvents: ['ticket.created'],
        enableGroupChat: false,
        templates: {},
      },
    };

    it('updates botToken', async () => {
      telegramConfigRepository.findOrCreate.mockResolvedValue(existingConfig);
      telegramConfigRepository.update.mockResolvedValue({});
      jest.spyOn(service as any, 'startBot').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'resolveSettings').mockResolvedValue(defaultSettings);
      telegramConfigRepository.findOrCreate.mockResolvedValue({
        botToken: 'new:token',
        settings: existingConfig.settings,
      });

      await service.updateConfig({ botToken: 'new:token' });

      expect(telegramConfigRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ botToken: 'new:token' }),
      );
    });

    it('restarts the bot when botToken changes', async () => {
      const startBotSpy = jest.spyOn(service as any, 'startBot').mockResolvedValue(undefined);
      telegramConfigRepository.findOrCreate.mockResolvedValue(existingConfig);
      telegramConfigRepository.update.mockResolvedValue({});
      jest.spyOn(service, 'getConfig').mockResolvedValue({} as any);

      await service.updateConfig({ botToken: 'new:token' });

      expect(startBotSpy).toHaveBeenCalled();
    });

    it('does not restart the bot for template-only changes', async () => {
      const startBotSpy = jest.spyOn(service as any, 'startBot').mockResolvedValue(undefined);
      telegramConfigRepository.findOrCreate.mockResolvedValue(existingConfig);
      telegramConfigRepository.update.mockResolvedValue({});
      jest.spyOn(service, 'getConfig').mockResolvedValue({} as any);

      await service.updateConfig({
        settings: { templates: { 'ticket.created': 'Custom template' } } as any,
      });

      expect(startBotSpy).not.toHaveBeenCalled();
    });

    it('clears botToken when empty string is provided', async () => {
      telegramConfigRepository.findOrCreate.mockResolvedValue(existingConfig);
      telegramConfigRepository.update.mockResolvedValue({});
      jest.spyOn(service as any, 'startBot').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'resolveSettings').mockResolvedValue(defaultSettings);
      telegramConfigRepository.findOrCreate.mockResolvedValue({
        botToken: null,
        settings: existingConfig.settings,
      });

      await service.updateConfig({ botToken: '' });

      expect(telegramConfigRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ botToken: null }),
      );
    });
  });

  describe('checkConfig()', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('returns error when no token is provided or configured', async () => {
      telegramConfigRepository.findFirst.mockResolvedValue(null);

      const result = await service.checkConfig(undefined, undefined);

      expect(result.bot.valid).toBe(false);
      expect(result.bot.error).toBe('Bot token not configured');
    });

    it('returns bot valid when getMe succeeds', async () => {
      const mockFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : '';
        if (url.includes('getMe')) {
          return {
            ok: true,
            json: async () => ({ ok: true, result: { username: 'TestBot', first_name: 'Test' } }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const result = await service.checkConfig('valid:token', undefined);

      expect(result.bot.valid).toBe(true);
      expect(result.bot.username).toBe('TestBot');
      expect(result.bot.firstName).toBe('Test');
      mockFetch.mockRestore();
    });

    it('returns bot error when getMe fails', async () => {
      const mockFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return {
          ok: false,
          status: 401,
          json: async () => ({ description: 'Unauthorized' }),
        } as Response;
      });

      const result = await service.checkConfig('bad:token', undefined);

      expect(result.bot.valid).toBe(false);
      expect(result.bot.error).toContain('401');
      mockFetch.mockRestore();
    });

    it('returns bot error when fetch throws', async () => {
      const mockFetch = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const result = await service.checkConfig('valid:token', undefined);

      expect(result.bot.valid).toBe(false);
      expect(result.bot.error).toBe('Network error');
      mockFetch.mockRestore();
    });

    it('validates groupChat when provided', async () => {
      const mockFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : '';
        if (url.includes('getMe')) {
          return {
            ok: true,
            json: async () => ({ ok: true, result: { username: 'TestBot', first_name: 'Test' } }),
          } as Response;
        }
        if (url.includes('getChat')) {
          return {
            ok: true,
            json: async () => ({ ok: true, result: { title: 'Group Chat', type: 'group' } }),
          } as Response;
        }
        if (url.includes('sendChatAction')) {
          return {
            ok: true,
            json: async () => ({ ok: true }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const result = await service.checkConfig('valid:token', '-100123456');

      expect(result.bot.valid).toBe(true);
      expect(result.groupChat).toBeDefined();
      expect(result.groupChat!.valid).toBe(true);
      expect(result.groupChat!.title).toBe('Group Chat');
      mockFetch.mockRestore();
    });

    it('reports groupChat invalid when sendChatAction fails', async () => {
      const mockFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : '';
        if (url.includes('getMe')) {
          return {
            ok: true,
            json: async () => ({ ok: true, result: { username: 'TestBot', first_name: 'Test' } }),
          } as Response;
        }
        if (url.includes('getChat')) {
          return {
            ok: true,
            json: async () => ({ ok: true, result: { title: 'Private Group', type: 'supergroup' } }),
          } as Response;
        }
        if (url.includes('sendChatAction')) {
          return {
            ok: false,
            status: 403,
            json: async () => ({ description: 'Forbidden: bot is not a member' }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const result = await service.checkConfig('valid:token', '-100123456');

      expect(result.groupChat!.valid).toBe(false);
      expect(result.groupChat!.error).toContain('403');
      mockFetch.mockRestore();
    });

    it('resolves groupChatId from settings when not provided', async () => {
      telegramConfigRepository.findFirst.mockResolvedValue({
        settings: {
          enabledEvents: ['ticket.created'],
          enableGroupChat: true,
          groupChatId: '-100789',
          templates: {},
        },
      });

      const mockFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : '';
        if (url.includes('getMe')) {
          return {
            ok: true,
            json: async () => ({ ok: true, result: { username: 'TestBot', first_name: 'Test' } }),
          } as Response;
        }
        if (url.includes('getChat') || url.includes('sendChatAction')) {
          return {
            ok: true,
            json: async () => ({ ok: true, result: { title: 'Resolved Group', type: 'group' } }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const result = await service.checkConfig('valid:token', undefined);

      expect(result.groupChat).toBeDefined();
      expect(result.groupChat!.valid).toBe(true);
      mockFetch.mockRestore();
    });
  });

  describe('renderMessage()', () => {
    it('replaces template variables', () => {
      const msg = service.renderMessage('ticket.created', {
        ticketNumber: 'T-42',
        subject: 'My printer is on fire',
        priority: 'High',
        createdBy: 'Alice',
        url: 'http://example.com/tickets/T-42',
      }, defaultSettings as any);

      expect(msg).toContain('T-42');
      expect(msg).toContain('My printer is on fire');
      expect(msg).toContain('High');
      expect(msg).toContain('Alice');
      expect(msg).toContain('http://example.com/tickets/T-42');
    });

    it('escapes HTML in variable values', () => {
      const msg = service.renderMessage('ticket.created', {
        ticketNumber: 'T-99',
        subject: '<script>alert("xss")</script>',
        priority: 'High',
        createdBy: 'Bob & Co.',
        url: 'http://example.com',
      }, defaultSettings as any);

      expect(msg).not.toContain('<script>');
      expect(msg).toContain('&lt;script&gt;');
      expect(msg).toContain('&quot;');
      expect(msg).toContain('&amp;');
    });

    it('returns empty string for unknown event', () => {
      const msg = service.renderMessage('unknown.event', { ticketNumber: 'T-1' }, defaultSettings as any);

      expect(msg).toBe('');
    });

    it('uses custom template from settings', () => {
      const customSettings = {
        ...defaultSettings,
        templates: { ...defaultSettings.templates, 'ticket.created': 'Custom: {ticketNumber}' },
      };

      const msg = service.renderMessage('ticket.created', { ticketNumber: 'T-1' }, customSettings as any);

      expect(msg).toBe('Custom: T-1');
    });
  });

  describe('sendEvent()', () => {
    beforeEach(() => {
      jest.spyOn(service as any, 'resolveToken').mockResolvedValue('bot:token');
      jest.spyOn(service as any, 'resolveSettings').mockResolvedValue(defaultSettings);
    });

    it('does nothing when no token is available', async () => {
      jest.spyOn(service as any, 'resolveToken').mockResolvedValue(null);
      const sendMsgSpy = jest.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      await service.sendEvent('ticket.created', { ticketNumber: 'T-1' });

      expect(sendMsgSpy).not.toHaveBeenCalled();
    });

    it('does nothing when event is not in enabledEvents', async () => {
      const sendMsgSpy = jest.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      await service.sendEvent('ticket.assigned', { ticketNumber: 'T-1' });

      expect(sendMsgSpy).not.toHaveBeenCalled();
    });

    it('sends to group chat when enabled', async () => {
      const groupSettings = {
        ...defaultSettings,
        enabledEvents: ['ticket.created', 'ticket.assigned'],
        enableGroupChat: true,
        groupChatId: '-100123',
        notifyIndividualsWhenGroupChat: false,
      };
      jest.spyOn(service as any, 'resolveSettings').mockResolvedValue(groupSettings);
      const sendMsgSpy = jest.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      await service.sendEvent('ticket.assigned', { ticketNumber: 'T-1', subject: 'Test' });

      expect(sendMsgSpy).toHaveBeenCalledWith('bot:token', -100123, expect.stringContaining('T-1'));
    });

    it('sends to both group and individuals when notifyIndividualsWhenGroupChat is true', async () => {
      const groupSettings = {
        ...defaultSettings,
        enabledEvents: ['ticket.created'],
        enableGroupChat: true,
        groupChatId: '-100123',
        notifyIndividualsWhenGroupChat: true,
      };
      jest.spyOn(service as any, 'resolveSettings').mockResolvedValue(groupSettings);
      userRepository.findTelegramLinkedUsers.mockResolvedValue([
        { telegramChatId: '111' },
        { telegramChatId: '222' },
      ]);
      const sendMsgSpy = jest.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      await service.sendEvent('ticket.created', { ticketNumber: 'T-1' });

      expect(sendMsgSpy).toHaveBeenCalledTimes(3); // group + 2 individuals
    });
  });

  describe('sendToUser()', () => {
    it('sends message to linked user', async () => {
      jest.spyOn(service as any, 'resolveToken').mockResolvedValue('bot:token');
      userRepository.getTelegramChatId.mockResolvedValue({ telegramChatId: '999' });
      const sendMsgSpy = jest.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      await service.sendToUser('user-1', 'Hello!');

      expect(sendMsgSpy).toHaveBeenCalledWith('bot:token', 999, 'Hello!');
    });

    it('does nothing when user has no chatId', async () => {
      jest.spyOn(service as any, 'resolveToken').mockResolvedValue('bot:token');
      userRepository.getTelegramChatId.mockResolvedValue({ telegramChatId: null });

      const sendMsgSpy = jest.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      await service.sendToUser('user-1', 'Hello!');

      expect(sendMsgSpy).not.toHaveBeenCalled();
    });

    it('does nothing when no token is available', async () => {
      jest.spyOn(service as any, 'resolveToken').mockResolvedValue(null);

      const sendMsgSpy = jest.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      await service.sendToUser('user-1', 'Hello!');

      expect(sendMsgSpy).not.toHaveBeenCalled();
    });
  });

  describe('sendTestNotification()', () => {
    it('throws when no token is configured', async () => {
      jest.spyOn(service as any, 'resolveToken').mockResolvedValue(null);

      await expect(service.sendTestNotification('user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws when user is not linked and no group chat', async () => {
      jest.spyOn(service as any, 'resolveToken').mockResolvedValue('bot:token');
      jest.spyOn(service as any, 'resolveSettings').mockResolvedValue(defaultSettings);
      userRepository.getTelegramChatId.mockResolvedValue({ telegramChatId: null });

      await expect(service.sendTestNotification('user-1')).rejects.toThrow(BadRequestException);
    });

    it('sends test notification successfully to linked user', async () => {
      jest.spyOn(service as any, 'resolveToken').mockResolvedValue('bot:token');
      jest.spyOn(service as any, 'resolveSettings').mockResolvedValue(defaultSettings);
      userRepository.getTelegramChatId.mockResolvedValue({ telegramChatId: '555' });
      const sendMsgSafeSpy = jest.spyOn(service as any, 'sendMessageSafe').mockResolvedValue(undefined);

      await service.sendTestNotification('user-1');

      expect(sendMsgSafeSpy).toHaveBeenCalledWith('bot:token', 555, expect.any(String));
    });

    it('sends to group and returns early when notifyIndividualsWhenGroupChat is false', async () => {
      const groupSettings = {
        ...defaultSettings,
        enableGroupChat: true,
        groupChatId: '-100456',
        notifyIndividualsWhenGroupChat: false,
      };
      jest.spyOn(service as any, 'resolveToken').mockResolvedValue('bot:token');
      jest.spyOn(service as any, 'resolveSettings').mockResolvedValue(groupSettings);
      const sendMsgSafeSpy = jest.spyOn(service as any, 'sendMessageSafe').mockResolvedValue(undefined);

      await service.sendTestNotification('user-1');

      expect(sendMsgSafeSpy).toHaveBeenCalledTimes(1);
      expect(sendMsgSafeSpy).toHaveBeenCalledWith('bot:token', -100456, expect.any(String));
    });

    it('falls back to personal message when group chat message fails', async () => {
      const groupSettings = {
        ...defaultSettings,
        enableGroupChat: true,
        groupChatId: '-100456',
        notifyIndividualsWhenGroupChat: false,
      };
      jest.spyOn(service as any, 'resolveToken').mockResolvedValue('bot:token');
      jest.spyOn(service as any, 'resolveSettings').mockResolvedValue(groupSettings);
      const sendMsgSafeSpy = jest.spyOn(service as any, 'sendMessageSafe')
        .mockRejectedValueOnce(new BadRequestException('API error'))
        .mockResolvedValueOnce(undefined);
      userRepository.getTelegramChatId.mockResolvedValue({ telegramChatId: '555' });

      await service.sendTestNotification('user-1');

      expect(sendMsgSafeSpy).toHaveBeenCalledTimes(2);
      expect(sendMsgSafeSpy).toHaveBeenNthCalledWith(1, 'bot:token', -100456, expect.any(String));
      expect(sendMsgSafeSpy).toHaveBeenNthCalledWith(2, 'bot:token', 555, expect.any(String));
    });
  });
});
