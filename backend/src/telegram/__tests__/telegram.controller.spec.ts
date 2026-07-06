import { Test, TestingModule } from '@nestjs/testing';
import { TelegramController } from '../telegram.controller';
import { TelegramService } from '../telegram.service';

describe('TelegramController', () => {
  let controller: TelegramController;
  let service: any;

  const mockService = {
    generateLinkCode: jest.fn(),
    unlink: jest.fn(),
    getStatus: jest.fn(),
    getConfig: jest.fn(),
    updateConfig: jest.fn(),
    sendTestNotification: jest.fn(),
    checkConfig: jest.fn(),
  };

  const userId = 'user-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramController],
      providers: [{ provide: TelegramService, useValue: mockService }],
    }).compile();
    controller = module.get<TelegramController>(TelegramController);
    service = module.get(TelegramService);
  });

  afterEach(() => jest.clearAllMocks());

  it('generateCode returns code with expiresIn', async () => {
    mockService.generateLinkCode.mockResolvedValue('abc12345');
    const result = await controller.generateCode(userId);
    expect(service.generateLinkCode).toHaveBeenCalledWith(userId);
    expect(result).toEqual({ code: 'abc12345', expiresIn: 300 });
  });

  it('unlink calls service and returns message', async () => {
    mockService.unlink.mockResolvedValue(undefined);
    const result = await controller.unlink(userId);
    expect(service.unlink).toHaveBeenCalledWith(userId);
    expect(result).toEqual({ message: 'Telegram unlinked' });
  });

  it('status calls service', async () => {
    mockService.getStatus.mockResolvedValue({ linked: true });
    const result = await controller.status(userId);
    expect(service.getStatus).toHaveBeenCalledWith(userId);
    expect(result).toEqual({ linked: true });
  });

  it('getConfig calls service', async () => {
    mockService.getConfig.mockResolvedValue({ hasBotToken: true, settings: {} });
    const result = await controller.getConfig();
    expect(service.getConfig).toHaveBeenCalled();
    expect(result).toEqual({ hasBotToken: true, settings: {} });
  });

  it('updateConfig calls service with body', async () => {
    const body = { settings: { enabledEvents: ['ticket.created'] } };
    mockService.updateConfig.mockResolvedValue({ hasBotToken: true, settings: body.settings });
    const result = await controller.updateConfig(body as any);
    expect(service.updateConfig).toHaveBeenCalledWith(body);
    expect(result).toEqual({ hasBotToken: true, settings: body.settings });
  });

  it('sendTestNotification calls service and returns message', async () => {
    mockService.sendTestNotification.mockResolvedValue(undefined);
    const result = await controller.sendTestNotification(userId);
    expect(service.sendTestNotification).toHaveBeenCalledWith(userId);
    expect(result).toEqual({ message: 'Test notification sent' });
  });

  it('check calls service with botToken and groupChatId', async () => {
    const body = { botToken: '123:abc', groupChatId: '-100test' };
    mockService.checkConfig.mockResolvedValue({ bot: { valid: true } });
    const result = await controller.check(body);
    expect(service.checkConfig).toHaveBeenCalledWith('123:abc', '-100test');
    expect(result).toEqual({ bot: { valid: true } });
  });
});
