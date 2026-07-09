import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../notifications.service';
import { NotificationRepository } from '../../common/repositories/notification.repository';
import { UserRepository } from '../../common/repositories/user.repository';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockNotificationRepository: any;
  let mockUserRepository: any;
  let mockEventEmitter: any;

  beforeEach(async () => {
    mockNotificationRepository = {
      create: jest.fn(),
      findByUserId: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      clearAll: jest.fn(),
      getUnreadCount: jest.fn(),
      deleteMany: jest.fn(),
    };
    mockUserRepository = {
      findSupportUsers: jest.fn(),
      getNotificationPreferences: jest.fn(),
      setNotificationPreferences: jest.fn(),
    };
    mockEventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationRepository, useValue: mockNotificationRepository },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  describe('handleTicketCreated', () => {
    it('skips support users who disabled ticket.created', async () => {
      mockUserRepository.findSupportUsers.mockResolvedValue([
        { id: 's1', notificationPreferences: null },
        { id: 's2', notificationPreferences: { 'ticket.created': false } },
      ]);
      mockUserRepository.getNotificationPreferences.mockResolvedValue(
        new Map([['r1', null]]),
      );
      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue({} as any);

      await service.handleTicketCreated({
        ticketId: 't1',
        ticketNumber: 'T-1',
        subject: 'Sub',
        requesterId: 'r1',
      });

      expect(createSpy).toHaveBeenCalledTimes(2); // s1 + r1, s2 skipped
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: 's1' }));
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: 'r1' }));
      expect(createSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ userId: 's2' }),
      );
    });

    it('skips the requester when they disabled ticket.created', async () => {
      mockUserRepository.findSupportUsers.mockResolvedValue([
        { id: 's1', notificationPreferences: null },
      ]);
      mockUserRepository.getNotificationPreferences.mockResolvedValue(
        new Map([['r1', { 'ticket.created': false }]]),
      );
      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue({} as any);

      await service.handleTicketCreated({
        ticketId: 't1',
        ticketNumber: 'T-1',
        subject: 'Sub',
        requesterId: 'r1',
      });

      expect(createSpy).toHaveBeenCalledTimes(1); // only s1
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: 's1' }));
    });
  });

  describe('handleTicketAssigned', () => {
    it('creates a notification when ticket.assigned is enabled', async () => {
      mockUserRepository.getNotificationPreferences.mockResolvedValue(
        new Map([['a1', null]]),
      );
      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue({} as any);

      await service.handleTicketAssigned({
        ticketId: 't1',
        ticketNumber: 'T-1',
        assignedToId: 'a1',
        assignedBy: 'mgr',
      });

      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: 'a1' }));
    });

    it('skips when ticket.assigned is disabled', async () => {
      mockUserRepository.getNotificationPreferences.mockResolvedValue(
        new Map([['a1', { 'ticket.assigned': false }]]),
      );
      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue({} as any);

      await service.handleTicketAssigned({
        ticketId: 't1',
        ticketNumber: 'T-1',
        assignedToId: 'a1',
        assignedBy: 'mgr',
      });

      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleTicketStatusUpdated', () => {
    it('skips a disabled target but notifies the enabled one', async () => {
      mockUserRepository.getNotificationPreferences.mockResolvedValue(
        new Map([
          ['a1', { 'ticket.status.updated': false }],
          ['r1', null],
        ]),
      );
      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue({} as any);

      await service.handleTicketStatusUpdated({
        ticketId: 't1',
        ticketNumber: 'T-1',
        oldStatus: 'Open',
        newStatus: 'InProgress',
        assignedToId: 'a1',
        requesterId: 'r1',
        updatedBy: 'mgr',
      });

      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: 'r1' }));
    });

    it('notifies both assignee and requester when both enabled', async () => {
      mockUserRepository.getNotificationPreferences.mockResolvedValue(
        new Map([
          ['a1', null],
          ['r1', null],
        ]),
      );
      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue({} as any);

      await service.handleTicketStatusUpdated({
        ticketId: 't1',
        ticketNumber: 'T-1',
        oldStatus: 'Open',
        newStatus: 'InProgress',
        assignedToId: 'a1',
        requesterId: 'r1',
        updatedBy: 'mgr',
      });

      expect(createSpy).toHaveBeenCalledTimes(2);
    });

    it('notifies once when assignee and requester are the same user', async () => {
      mockUserRepository.getNotificationPreferences.mockResolvedValue(
        new Map([['u1', null]]),
      );
      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue({} as any);

      await service.handleTicketStatusUpdated({
        ticketId: 't1',
        ticketNumber: 'T-1',
        oldStatus: 'Open',
        newStatus: 'InProgress',
        assignedToId: 'u1',
        requesterId: 'u1',
        updatedBy: 'mgr',
      });

      expect(createSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPreferences', () => {
    it('normalizes stored prefs per ITSupport role', async () => {
      mockUserRepository.getNotificationPreferences.mockResolvedValue(
        new Map([['u1', { 'ticket.created': false }]]),
      );

      const result = await service.getPreferences('u1', Role.ITSupport);

      expect(result.preferences).toEqual({
        'ticket.created': false,
        'ticket.assigned': true,
        'ticket.status.updated': true,
        'ticket.priority.updated': true,
      });
      expect(result.availableEvents.map((e) => e.event)).toEqual([
        'ticket.created',
        'ticket.assigned',
        'ticket.status.updated',
        'ticket.priority.updated',
      ]);
    });

    it('hides ticket.assigned from EndUser', async () => {
      mockUserRepository.getNotificationPreferences.mockResolvedValue(
        new Map([['u1', null]]),
      );

      const result = await service.getPreferences('u1', Role.EndUser);

      expect(Object.keys(result.preferences)).toEqual([
        'ticket.created',
        'ticket.status.updated',
        'ticket.priority.updated',
      ]);
      expect(
        result.availableEvents.map((e) => e.event),
      ).toEqual(['ticket.created', 'ticket.status.updated', 'ticket.priority.updated']);
    });
  });

  describe('updatePreferences', () => {
    it('stores a normalized full set, defaulting missing keys to true', async () => {
      mockUserRepository.setNotificationPreferences.mockResolvedValue({});

      const result = await service.updatePreferences('u1', Role.ITSupport, {
        preferences: { 'ticket.created': false, 'ticket.assigned': true },
      });

      expect(mockUserRepository.setNotificationPreferences).toHaveBeenCalledWith(
        'u1',
        {
          'ticket.created': false,
          'ticket.assigned': true,
          'ticket.status.updated': true,
          'ticket.priority.updated': true,
        },
      );
      expect(result.preferences['ticket.created']).toBe(false);
    });

    it('throws BadRequestException for an event not allowed for the role', async () => {
      await expect(
        service.updatePreferences('u1', Role.EndUser, {
          preferences: { 'ticket.assigned': true },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for a non-boolean value', async () => {
      await expect(
        service.updatePreferences('u1', Role.ITSupport, {
          preferences: { 'ticket.created': 'yes' as unknown as boolean },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
