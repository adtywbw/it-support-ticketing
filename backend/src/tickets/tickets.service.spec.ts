import { Test, TestingModule } from '@nestjs/testing';
import { TicketsService } from './tickets.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TicketStatus, Priority, SLAStatus } from '@prisma/client';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { RedisService } from '../redis/redis.service';
import { SLAService } from '../sla/sla.service';

describe('TicketsService', () => {
  let service: TicketsService;
  let prisma: any;
  let eventEmitter: any;

  const mockPrisma = {
    ticket: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
    },
    subCategory: {
      findUnique: jest.fn(),
    },
    ticketHistory: {
      create: jest.fn(),
    },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockRedisService = {
    getClient: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    ping: jest.fn(),
  };

  const mockSlaService = {
    getSLAConfig: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockStorageService = {
    save: jest.fn(),
    delete: jest.fn(),
    getReadStream: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: RedisService, useValue: mockRedisService },
        { provide: SLAService, useValue: mockSlaService },
        { provide: 'StorageService', useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
    prisma = module.get(PrismaService);
    eventEmitter = module.get(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const requesterId = 'user-1';
    const createTicketDto: CreateTicketDto = {
      subject: 'Cannot connect to VPN',
      description: 'Getting error code 789 when connecting',
      categoryId: 'cat-1',
      priority: Priority.High,
    };
    const now = new Date('2026-06-18T12:00:00Z');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should create a ticket successfully with generated ticket number, audit trail, and return ticket', async () => {
      const mockCategory = {
        id: 'cat-1',
        name: 'Network',
        slaConfigs: [
          {
            id: 'sla-1',
            priority: Priority.High,
            resolutionTimeMinutes: 480,
            isActive: true,
          },
        ],
      };

      const slaDueAt = new Date(now.getTime() + 480 * 60 * 1000);

      const mockCreatedTicket = {
        id: 'ticket-1',
        ticketNumber: 'TKT-001',
        subject: createTicketDto.subject,
        description: createTicketDto.description,
        requesterId,
        categoryId: createTicketDto.categoryId,
        subCategoryId: null,
        priority: Priority.High,
        slaDueAt,
        slaStatus: SLAStatus.OnTrack,
        status: TicketStatus.Open,
        requester: { id: requesterId, name: 'John Doe', email: 'john@test.com' },
        category: { id: 'cat-1', name: 'Network' },
        subCategory: null,
      };

      mockPrisma.category.findUnique.mockResolvedValue(mockCategory);
      mockPrisma.ticket.findFirst.mockResolvedValue(null);
      mockPrisma.ticket.create.mockResolvedValue(mockCreatedTicket);
      mockPrisma.ticketHistory.create.mockResolvedValue({});

      const result = await service.create(createTicketDto, requesterId);

      expect(mockPrisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: createTicketDto.categoryId },
        include: {
          slaConfigs: {
            where: { priority: Priority.High, isActive: true },
          },
        },
      });

      expect(mockPrisma.ticket.findFirst).toHaveBeenCalledWith({
        orderBy: { ticketNumber: 'desc' },
        select: { ticketNumber: true },
      });

      expect(mockPrisma.ticket.create).toHaveBeenCalledWith({
        data: {
          ticketNumber: 'TKT-001',
          subject: createTicketDto.subject,
          description: createTicketDto.description,
          requesterId,
          categoryId: createTicketDto.categoryId,
          subCategoryId: null,
          priority: Priority.High,
          slaDueAt,
          slaStatus: SLAStatus.OnTrack,
          status: TicketStatus.Open,
        },
        include: {
          requester: { select: { id: true, name: true, email: true } },
          category: true,
          subCategory: true,
        },
      });

      expect(mockPrisma.ticketHistory.create).toHaveBeenCalledWith({
        data: {
          ticketId: 'ticket-1',
          userId: requesterId,
          field: 'status',
          oldValue: null,
          newValue: TicketStatus.Open,
        },
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith('ticket.created', {
        ticketId: 'ticket-1',
        ticketNumber: 'TKT-001',
        subject: createTicketDto.subject,
        priority: Priority.High,
        requesterId,
        requesterEmail: 'john@test.com',
      });

      expect(result).toEqual(mockCreatedTicket);
    });

    it('should throw BadRequestException when category is not found', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.create(createTicketDto, requesterId),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: createTicketDto.categoryId },
        include: {
          slaConfigs: {
            where: { priority: Priority.High, isActive: true },
          },
        },
      });

      expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
      expect(mockPrisma.ticketHistory.create).not.toHaveBeenCalled();
    });

    it('should format ticket number as TKT-XXX', async () => {
      const mockCategory = {
        id: 'cat-1',
        name: 'Network',
        slaConfigs: [],
      };

      mockPrisma.category.findUnique.mockResolvedValue(mockCategory);
      mockPrisma.ticket.findFirst.mockResolvedValueOnce(null);
      mockPrisma.ticket.create.mockResolvedValue({
        id: 'ticket-2',
        ticketNumber: 'TKT-001',
        subject: createTicketDto.subject,
        description: createTicketDto.description,
        requesterId,
        categoryId: createTicketDto.categoryId,
        subCategoryId: null,
        priority: Priority.High,
        slaDueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        slaStatus: SLAStatus.OnTrack,
        status: TicketStatus.Open,
        requester: { id: requesterId, name: 'John Doe', email: 'john@test.com' },
        category: { id: 'cat-1', name: 'Network' },
        subCategory: null,
      });

      await service.create(createTicketDto, requesterId);

      expect(mockPrisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ticketNumber: 'TKT-001',
          }),
        }),
      );

      mockPrisma.ticket.findFirst.mockResolvedValueOnce({
        ticketNumber: 'TKT-005',
      });
      mockPrisma.ticket.create.mockResolvedValue({
        id: 'ticket-3',
        ticketNumber: 'TKT-006',
        subject: createTicketDto.subject,
        description: createTicketDto.description,
        requesterId,
        categoryId: createTicketDto.categoryId,
        subCategoryId: null,
        priority: Priority.High,
        slaDueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        slaStatus: SLAStatus.OnTrack,
        status: TicketStatus.Open,
        requester: { id: requesterId, name: 'John Doe', email: 'john@test.com' },
        category: { id: 'cat-1', name: 'Network' },
        subCategory: null,
      });

      await service.create(createTicketDto, requesterId);

      expect(mockPrisma.ticket.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ticketNumber: 'TKT-006',
          }),
        }),
      );
    });

    it('should set SLA due date from slaConfig when available', async () => {
      const resolutionTimeMinutes = 120;
      const mockCategory = {
        id: 'cat-1',
        name: 'Network',
        slaConfigs: [
          {
            id: 'sla-1',
            priority: Priority.High,
            isActive: true,
            resolutionTimeMinutes,
          },
        ],
      };

      mockPrisma.category.findUnique.mockResolvedValue(mockCategory);
      mockPrisma.ticket.findFirst.mockResolvedValue(null);

      const expectedSlaDue = new Date(now.getTime() + resolutionTimeMinutes * 60 * 1000);

      await service.create(createTicketDto, requesterId);

      expect(mockPrisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slaDueAt: expectedSlaDue,
          }),
        }),
      );
    });

    it('should set default SLA due date (24h) when no slaConfig exists', async () => {
      const mockCategory = {
        id: 'cat-1',
        name: 'Network',
        slaConfigs: [],
      };

      mockPrisma.category.findUnique.mockResolvedValue(mockCategory);
      mockPrisma.ticket.findFirst.mockResolvedValue(null);

      const expectedSlaDue = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await service.create(createTicketDto, requesterId);

      expect(mockPrisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slaDueAt: expectedSlaDue,
          }),
        }),
      );
    });
  });

  describe('findAll', () => {
    const mockTickets = [
      {
        id: 'ticket-1',
        ticketNumber: 'TKT-001',
        subject: 'VPN Issue',
        status: TicketStatus.Open,
        priority: Priority.High,
        slaDueAt: new Date(),
        slaStatus: SLAStatus.OnTrack,
        createdAt: new Date(),
        requester: { id: 'user-1', name: 'John', email: 'john@test.com' },
        assignedTo: null,
        category: { id: 'cat-1', name: 'Network' },
        subCategory: null,
        _count: { comments: 0, attachments: 0 },
      },
    ];

    it('should return paginated tickets with default pagination', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue(mockTickets);
      mockPrisma.ticket.count.mockResolvedValue(1);

      const queryTicketDto: QueryTicketDto = {};
      const result = await service.findAll(queryTicketDto, 'Admin', 'admin-1');

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          where: {},
        }),
      );

      expect(mockPrisma.ticket.count).toHaveBeenCalledWith({ where: {} });

      expect(result).toEqual({
        data: mockTickets,
        meta: { page: 1, limit: 10, total: 1 },
      });
    });

    it('should apply filters correctly', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue(mockTickets);
      mockPrisma.ticket.count.mockResolvedValue(1);

      const queryTicketDto: QueryTicketDto = {
        status: TicketStatus.Open,
        priority: Priority.High,
        categoryId: 'cat-1',
        page: 2,
        limit: 5,
      };

      const result = await service.findAll(queryTicketDto, 'Admin', 'admin-1');

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: TicketStatus.Open,
            priority: Priority.High,
            categoryId: 'cat-1',
          },
          skip: 5,
          take: 5,
        }),
      );

      expect(mockPrisma.ticket.count).toHaveBeenCalledWith({
        where: {
          status: TicketStatus.Open,
          priority: Priority.High,
          categoryId: 'cat-1',
        },
      });

      expect(result.meta).toEqual({ page: 2, limit: 5, total: 1 });
    });

    it('should search by subject using case-insensitive contains', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue(mockTickets);
      mockPrisma.ticket.count.mockResolvedValue(1);

      const queryTicketDto: QueryTicketDto = {
        search: 'vpn',
      };

      await service.findAll(queryTicketDto, 'Admin', 'admin-1');

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { subject: { contains: 'vpn', mode: 'insensitive' } },
              { description: { contains: 'vpn', mode: 'insensitive' } },
              { ticketNumber: { contains: 'vpn', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('should restrict to requester tickets for EndUser role', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue(mockTickets);
      mockPrisma.ticket.count.mockResolvedValue(1);

      const queryTicketDto: QueryTicketDto = {};
      await service.findAll(queryTicketDto, 'EndUser', 'user-1');

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            requesterId: 'user-1',
          },
        }),
      );
    });
  });

  describe('updateStatus', () => {
    const ticketId = 'ticket-1';
    const userId = 'user-1';

    it('should successfully transition from Open to InProgress', async () => {
      const existingTicket = {
        id: ticketId,
        ticketNumber: 'TKT-001',
        status: TicketStatus.Open,
        assignedToId: 'agent-1',
      };

      const updatedTicket = {
        ...existingTicket,
        status: TicketStatus.InProgress,
      };

      mockPrisma.ticket.findUnique.mockResolvedValue(existingTicket);
      mockPrisma.ticket.update.mockResolvedValue(updatedTicket);
      mockPrisma.ticketHistory.create.mockResolvedValue({});

      const updateStatusDto: UpdateStatusDto = {
        status: TicketStatus.InProgress,
      };

      const result = await service.updateStatus(ticketId, updateStatusDto, userId);

      expect(mockPrisma.ticket.findUnique).toHaveBeenCalledWith({
        where: { id: ticketId },
      });

      expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
        where: { id: ticketId },
        data: { status: TicketStatus.InProgress },
      });

      expect(mockPrisma.ticketHistory.create).toHaveBeenCalledWith({
        data: {
          ticketId,
          userId,
          field: 'status',
          oldValue: TicketStatus.Open,
          newValue: TicketStatus.InProgress,
        },
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith('ticket.status.updated', {
        ticketId,
        ticketNumber: 'TKT-001',
        oldStatus: TicketStatus.Open,
        newStatus: TicketStatus.InProgress,
        assignedToId: 'agent-1',
        updatedBy: userId,
      });

      expect(result).toEqual(updatedTicket);
    });

    it('should throw BadRequestException for invalid transition from Open to Closed', async () => {
      const existingTicket = {
        id: ticketId,
        ticketNumber: 'TKT-001',
        status: TicketStatus.Open,
        assignedToId: null,
      };

      mockPrisma.ticket.findUnique.mockResolvedValue(existingTicket);

      const updateStatusDto: UpdateStatusDto = {
        status: TicketStatus.Closed,
      };

      await expect(
        service.updateStatus(ticketId, updateStatusDto, userId),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
      expect(mockPrisma.ticketHistory.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when ticket does not exist', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(null);

      const updateStatusDto: UpdateStatusDto = {
        status: TicketStatus.InProgress,
      };

      await expect(
        service.updateStatus(ticketId, updateStatusDto, userId),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
      expect(mockPrisma.ticketHistory.create).not.toHaveBeenCalled();
    });

    it('should set resolvedAt when transitioning to Resolved', async () => {
      const existingTicket = {
        id: ticketId,
        ticketNumber: 'TKT-001',
        status: TicketStatus.InProgress,
        assignedToId: 'agent-1',
      };

      mockPrisma.ticket.findUnique.mockResolvedValue(existingTicket);
      mockPrisma.ticket.update.mockImplementation(async ({ data }) => ({
        ...existingTicket,
        status: TicketStatus.Resolved,
        resolvedAt: data.resolvedAt,
      }));
      mockPrisma.ticketHistory.create.mockResolvedValue({});

      const updateStatusDto: UpdateStatusDto = {
        status: TicketStatus.Resolved,
      };

      await service.updateStatus(ticketId, updateStatusDto, userId);

      expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
        where: { id: ticketId },
        data: expect.objectContaining({
          status: TicketStatus.Resolved,
          resolvedAt: expect.any(Date),
        }),
      });
    });

    it('should set closedAt when transitioning to Closed', async () => {
      const existingTicket = {
        id: ticketId,
        ticketNumber: 'TKT-001',
        status: TicketStatus.Resolved,
        assignedToId: 'agent-1',
      };

      mockPrisma.ticket.findUnique.mockResolvedValue(existingTicket);
      mockPrisma.ticket.update.mockImplementation(async ({ data }) => ({
        ...existingTicket,
        status: TicketStatus.Closed,
        closedAt: data.closedAt,
      }));
      mockPrisma.ticketHistory.create.mockResolvedValue({});

      const updateStatusDto: UpdateStatusDto = {
        status: TicketStatus.Closed,
      };

      await service.updateStatus(ticketId, updateStatusDto, userId);

      expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
        where: { id: ticketId },
        data: expect.objectContaining({
          status: TicketStatus.Closed,
          closedAt: expect.any(Date),
        }),
      });
    });
  });
});
