import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from '../notifications.controller';
import { NotificationsService } from '../notifications.service';
import { Role } from '@prisma/client';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notificationsService: any;

  const mockNotificationsService = {
    findByUserId: jest.fn(),
    getUnreadCount: jest.fn(),
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    clearAll: jest.fn(),
  };

  const userId = 'user-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    notificationsService = module.get(NotificationsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll()', () => {
    it('should call notificationsService.findByUserId with query', async () => {
      const query = { page: 1, limit: 10, unreadOnly: 'true' };
      mockNotificationsService.findByUserId.mockResolvedValue({ data: [], meta: { total: 0 } });

      await controller.findAll(userId, query as any);

      expect(notificationsService.findByUserId).toHaveBeenCalledWith(userId, {
        page: 1, limit: 10, unreadOnly: true,
      });
    });

    it('should pass unreadOnly as false when not set', async () => {
      mockNotificationsService.findByUserId.mockResolvedValue({ data: [], meta: { total: 0 } });

      await controller.findAll(userId, {} as any);

      expect(notificationsService.findByUserId).toHaveBeenCalledWith(userId, {
        page: undefined, limit: undefined, unreadOnly: false,
      });
    });
  });

  describe('getUnreadCount()', () => {
    it('should return count from notificationsService', async () => {
      mockNotificationsService.getUnreadCount.mockResolvedValue(5);

      const result = await controller.getUnreadCount(userId);

      expect(notificationsService.getUnreadCount).toHaveBeenCalledWith(userId);
      expect(result).toEqual({ count: 5 });
    });
  });

  describe('getPreferences()', () => {
    it('should return user preferences', async () => {
      const prefs = { data: { preferences: { ticket_created: true }, availableEvents: [] } };
      mockNotificationsService.getPreferences.mockResolvedValue(prefs);

      const result = await controller.getPreferences(userId, Role.Admin);

      expect(notificationsService.getPreferences).toHaveBeenCalledWith(userId, Role.Admin);
      expect(result).toEqual(prefs);
    });
  });

  describe('updatePreferences()', () => {
    it('should call updatePreferences with DTO', async () => {
      const dto = { preferences: { ticket_created: false } };
      const resultData = { data: { preferences: { ticket_created: false }, availableEvents: [] } };
      mockNotificationsService.updatePreferences.mockResolvedValue(resultData);

      const result = await controller.updatePreferences(userId, Role.Admin, dto as any);

      expect(notificationsService.updatePreferences).toHaveBeenCalledWith(userId, Role.Admin, dto);
      expect(result).toEqual(resultData);
    });
  });

  describe('markAsRead()', () => {
    it('should mark notification as read and return message', async () => {
      mockNotificationsService.markAsRead.mockResolvedValue(undefined);

      const result = await controller.markAsRead('notif-1', userId);

      expect(notificationsService.markAsRead).toHaveBeenCalledWith('notif-1', userId);
      expect(result).toEqual({ message: 'Notification marked as read' });
    });
  });

  describe('markAllAsRead()', () => {
    it('should mark all as read and return message', async () => {
      mockNotificationsService.markAllAsRead.mockResolvedValue(undefined);

      const result = await controller.markAllAsRead(userId);

      expect(notificationsService.markAllAsRead).toHaveBeenCalledWith(userId);
      expect(result).toEqual({ message: 'All notifications marked as read' });
    });
  });

  describe('clearAll()', () => {
    it('should clear all and return message', async () => {
      mockNotificationsService.clearAll.mockResolvedValue(undefined);

      const result = await controller.clearAll(userId);

      expect(notificationsService.clearAll).toHaveBeenCalledWith(userId);
      expect(result).toEqual({ message: 'All notifications cleared' });
    });
  });
});
