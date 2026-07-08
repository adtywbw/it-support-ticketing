import { Test, TestingModule } from '@nestjs/testing';
import { TicketsService } from './tickets.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TicketStatus, Priority, SLAStatus } from '@prisma/client';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { TicketRepository, buildTicketAccessWhere } from '../common/repositories/ticket.repository';
import { CategoryRepository } from '../common/repositories/category.repository';
import { SubCategoryRepository } from '../common/repositories/sub-category.repository';
import { UserRepository } from '../common/repositories/user.repository';
import { SLAService } from '../sla/sla.service';
import { STORAGE_SERVICE } from '../attachments/interfaces/storage-service.interface';

describe('TicketsService', () => {
  let service: TicketsService;
  let ticketRepository: any;
  let categoryRepository: any;
  let subCategoryRepository: any;
  let userRepository: any;
  let eventEmitter: any;

  const mockTicketRepository = {
    create: jest.fn(),
    findById: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findManyForUser: jest.fn().mockImplementation((args: any, scope: any) => {
      return Promise.resolve(buildTicketAccessWhere(scope, args.where) === args.where ? [] : []);
    }),
    findManySortedBySlaStatus: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    countForUser: jest.fn().mockResolvedValue(0),
    update: jest.fn(),
    updateMany: jest.fn(),
    transaction: jest.fn(),
    transactionBatch: jest.fn(),
    countPublicCommentsByTicketIds: jest.fn().mockResolvedValue([]),
    countVisibleAttachmentsByTicketIds: jest.fn().mockResolvedValue([]),
  };

  const mockCategoryRepository = {
    findById: jest.fn(),
    findAll: jest.fn(),
    findByName: jest.fn(),
  };

  const mockSubCategoryRepository = {
    findById: jest.fn(),
    findByCategoryId: jest.fn(),
    findByCategoryAndName: jest.fn(),
  };

  const mockUserRepository = {
    getForValidation: jest.fn(),
  };

  const mockSlaService = {
    getSLAConfig: jest.fn().mockResolvedValue(null),
    calculateSlaStatus: jest.fn((slaDueAt: Date | null, _resolutionTimeMinutes: number, now: Date) =>
      slaDueAt && slaDueAt <= now ? 'Breached' : 'OnTrack',
    ),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
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
        { provide: TicketRepository, useValue: mockTicketRepository },
        { provide: CategoryRepository, useValue: mockCategoryRepository },
        { provide: SubCategoryRepository, useValue: mockSubCategoryRepository },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: SLAService, useValue: mockSlaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: STORAGE_SERVICE, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
    ticketRepository = module.get(TicketRepository);
    categoryRepository = module.get(CategoryRepository);
    subCategoryRepository = module.get(SubCategoryRepository);
    userRepository = module.get(UserRepository);
    eventEmitter = module.get(EventEmitter2);

    mockTicketRepository.transaction.mockImplementation(
      (fn: (tx: Record<string, unknown>) => unknown) =>
        fn({
          $queryRaw: jest.fn().mockResolvedValue([{ seq: 1n }]),
          ticket: {
            findFirst: (...args: unknown[]) =>
              mockTicketRepository.findFirst(...args),
            create: (args: { data: unknown; include?: unknown }) =>
              mockTicketRepository.create(args.data, args.include),
            findUnique: (args: { where: { id: string } }) =>
              mockTicketRepository.findById(args.where.id),
            update: (args: { where: unknown; data: unknown }) =>
              mockTicketRepository.update(args.where, args.data),
            updateMany: (args: { where: unknown; data: unknown }) =>
              mockTicketRepository.updateMany(args.where, args.data),
          },
          ticketHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
          ticketHistoryDeleteMany: jest.fn(),
          commentDeleteMany: jest.fn(),
          attachmentDeleteMany: jest.fn(),
          ticketDelete: jest.fn(),
        }),
    );
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
      subCategoryId: 'sub-1',
      locationId: 'loc-1',
      itemCode: '-',
      priority: Priority.High,
    };
    const now = new Date('2026-06-18T12:00:00Z');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(now);
      mockSubCategoryRepository.findById.mockResolvedValue({
        id: 'sub-1',
        categoryId: 'cat-1',
        name: 'VPN Issues',
        isActive: true,
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should create a ticket successfully with generated ticket number, audit trail, and return ticket', async () => {
      const mockCategory = {
        id: 'cat-1',
        name: 'Network',
        isActive: true,
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

      mockCategoryRepository.findById.mockResolvedValue(mockCategory);
      mockTicketRepository.findFirst.mockResolvedValue(null);
      mockTicketRepository.create.mockResolvedValue(mockCreatedTicket);

      const result = await service.create(createTicketDto, requesterId);

      expect(mockCategoryRepository.findById).toHaveBeenCalledWith(
        createTicketDto.categoryId,
        {},
      );

      expect(mockSlaService.getSLAConfig).toHaveBeenCalledWith(
        createTicketDto.categoryId,
        createTicketDto.priority || Priority.Medium,
      );

      expect(mockTicketRepository.transaction).toHaveBeenCalledWith(
        expect.any(Function),
      );

      expect(mockTicketRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketNumber: 'TKT-001',
          subject: createTicketDto.subject,
        }),
        expect.objectContaining({
          requester: { select: { id: true, name: true, email: true } },
          category: true,
          subCategory: true,
        }),
      );

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
      mockCategoryRepository.findById.mockResolvedValue(null);

      await expect(
        service.create(createTicketDto, requesterId),
      ).rejects.toThrow(BadRequestException);

      expect(mockCategoryRepository.findById).toHaveBeenCalledWith(
        createTicketDto.categoryId,
        expect.any(Object),
      );

      expect(mockTicketRepository.create).not.toHaveBeenCalled();
    });

    it('should format ticket number as TKT-XXX', async () => {
      const mockCategory = {
        id: 'cat-1',
        name: 'Network',
        isActive: true,
        slaConfigs: [],
      };

      mockCategoryRepository.findById.mockResolvedValue(mockCategory);

      // First call: no existing tickets, max_seq = 0, so ticket number = TKT-001
      mockTicketRepository.transaction.mockImplementationOnce(
        (fn: (tx: Record<string, unknown>) => unknown) =>
          fn({
            $queryRaw: jest.fn().mockResolvedValueOnce([{ seq: 1n }]),
            ticket: {
              create: (args: { data: unknown; include?: unknown }) =>
                mockTicketRepository.create(args.data, args.include),
            },
            ticketHistory: {
              create: jest.fn().mockResolvedValue({}),
            },
          }),
      );

      mockTicketRepository.create.mockResolvedValueOnce({
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

      expect(mockTicketRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ticketNumber: 'TKT-001' }),
        expect.any(Object),
      );

      // Second call: seq = 6, so ticket number = TKT-006
      mockTicketRepository.transaction.mockImplementationOnce(
        (fn: (tx: Record<string, unknown>) => unknown) =>
          fn({
            $queryRaw: jest.fn().mockResolvedValueOnce([{ seq: 6n }]),
            ticket: {
              create: (args: { data: unknown; include?: unknown }) =>
                mockTicketRepository.create(args.data, args.include),
            },
            ticketHistory: {
              create: jest.fn().mockResolvedValue({}),
            },
          }),
      );

      mockTicketRepository.create.mockResolvedValueOnce({
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

      expect(mockTicketRepository.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ ticketNumber: 'TKT-006' }),
        expect.any(Object),
      );
    });

    it('should set SLA due date from slaConfig when available', async () => {
      const resolutionTimeMinutes = 120;
      const mockCategory = {
        id: 'cat-1',
        name: 'Network',
        isActive: true,
      };

      mockCategoryRepository.findById.mockResolvedValue(mockCategory);
      mockSlaService.getSLAConfig.mockResolvedValueOnce({
        id: 'sla-1',
        categoryId: 'cat-1',
        priority: Priority.High,
        isActive: true,
        resolutionTimeMinutes,
      });
      mockTicketRepository.findFirst.mockResolvedValue(null);

      await service.create(createTicketDto, requesterId);

      expect(mockTicketRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slaDueAt: new Date(now.getTime() + resolutionTimeMinutes * 60 * 1000),
        }),
        expect.any(Object),
      );
    });

    it('should set slaDueAt to null when no slaConfig exists', async () => {
      const mockCategory = {
        id: 'cat-1',
        name: 'Network',
        isActive: true,
      };

      mockCategoryRepository.findById.mockResolvedValue(mockCategory);
      mockSlaService.getSLAConfig.mockResolvedValueOnce(null);
      mockTicketRepository.findFirst.mockResolvedValue(null);

      await service.create(createTicketDto, requesterId);

      expect(mockTicketRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slaDueAt: null,
          slaStatus: null,
        }),
        expect.any(Object),
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
      mockTicketRepository.findManyForUser.mockResolvedValue(mockTickets);
      mockTicketRepository.countForUser.mockResolvedValue(1);

      const queryTicketDto: QueryTicketDto = {};
      const result = await service.findAll(queryTicketDto, 'Admin', 'admin-1');

      expect(mockTicketRepository.findManyForUser).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          where: {},
        }),
        expect.objectContaining({ userId: 'admin-1', role: 'Admin' }),
      );

      expect(mockTicketRepository.countForUser).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ userId: 'admin-1', role: 'Admin' }),
      );

      expect(result).toEqual({
        data: mockTickets,
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      });
    });

    it('should apply filters correctly', async () => {
      mockTicketRepository.findManyForUser.mockResolvedValue(mockTickets);
      mockTicketRepository.countForUser.mockResolvedValue(1);

      const queryTicketDto: QueryTicketDto = {
        status: [TicketStatus.Open],
        priority: [Priority.High],
        categoryId: ['cat-1'],
        page: 2,
        limit: 5,
      };

      await service.findAll(queryTicketDto, 'Admin', 'admin-1');

      expect(mockTicketRepository.findManyForUser).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: { in: [TicketStatus.Open] },
            priority: { in: [Priority.High] },
            categoryId: { in: ['cat-1'] },
          },
          skip: 5,
          take: 5,
        }),
        expect.any(Object),
      );

      expect(mockTicketRepository.countForUser).toHaveBeenCalledWith(
        {
          status: { in: [TicketStatus.Open] },
          priority: { in: [Priority.High] },
          categoryId: { in: ['cat-1'] },
        },
        expect.any(Object),
      );
    });

    it('should search by subject using case-insensitive contains', async () => {
      mockTicketRepository.findManyForUser.mockResolvedValue(mockTickets);
      mockTicketRepository.countForUser.mockResolvedValue(1);

      const queryTicketDto: QueryTicketDto = {
        search: 'vpn',
      };

      await service.findAll(queryTicketDto, 'Admin', 'admin-1');

      expect(mockTicketRepository.findManyForUser).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { subject: { contains: 'vpn', mode: 'insensitive' } },
              { description: { contains: 'vpn', mode: 'insensitive' } },
              { ticketNumber: { contains: 'vpn', mode: 'insensitive' } },
              { itemCode: { contains: 'vpn', mode: 'insensitive' } },
              { location: { name: { contains: 'vpn', mode: 'insensitive' } } },
              { requester: { name: { contains: 'vpn', mode: 'insensitive' } } },
            ],
          },
        }),
        expect.any(Object),
      );
    });

    it('should restrict to requester tickets for EndUser role', async () => {
      mockTicketRepository.findManyForUser.mockResolvedValue(mockTickets);
      mockTicketRepository.countForUser.mockResolvedValue(1);
      mockTicketRepository.findUnique.mockResolvedValue({
        _count: { comments: 0, attachments: 0 },
      });

      const queryTicketDto: QueryTicketDto = {};
      await service.findAll(queryTicketDto, 'EndUser', 'user-1');

      // The service passes the where WITHOUT requesterId; the repository
      // is responsible for adding it via the scope (see buildTicketAccessWhere).
      expect(mockTicketRepository.findManyForUser).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
        expect.objectContaining({ userId: 'user-1', role: 'EndUser' }),
      );
    });

    it('should call findManySortedBySlaStatus when sortBy=slaStatus', async () => {
      const slaSortedTickets = [
        { id: 't1', slaStatus: SLAStatus.Breached, _count: { comments: 0, attachments: 0 } },
        { id: 't2', slaStatus: SLAStatus.AtRisk, _count: { comments: 0, attachments: 0 } },
        { id: 't3', slaStatus: SLAStatus.OnTrack, _count: { comments: 0, attachments: 0 } },
      ];
      mockTicketRepository.findManySortedBySlaStatus.mockResolvedValue(slaSortedTickets);
      mockTicketRepository.countForUser.mockResolvedValue(3);

      const queryTicketDto: QueryTicketDto = {
        sortBy: 'slaStatus',
        sortOrder: 'asc',
      };

      const result = await service.findAll(queryTicketDto, 'Admin', 'admin-1');

      expect(mockTicketRepository.findManySortedBySlaStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: { userId: 'admin-1', role: 'Admin' },
          sortOrder: 'asc',
          skip: 0,
          take: 10,
        }),
      );
      expect(mockTicketRepository.findManyForUser).not.toHaveBeenCalled();
      expect(result.data).toEqual(slaSortedTickets);
    });

    it('should call findManySortedBySlaStatus with sortOrder=desc when sortBy=slaStatus', async () => {
      const slaSortedTicketsDesc = [
        { id: 't1', slaStatus: SLAStatus.OnTrack, _count: { comments: 0, attachments: 0 } },
        { id: 't2', slaStatus: SLAStatus.AtRisk, _count: { comments: 0, attachments: 0 } },
        { id: 't3', slaStatus: SLAStatus.Breached, _count: { comments: 0, attachments: 0 } },
      ];
      mockTicketRepository.findManySortedBySlaStatus.mockResolvedValue(slaSortedTicketsDesc);
      mockTicketRepository.countForUser.mockResolvedValue(3);

      const queryTicketDto: QueryTicketDto = {
        sortBy: 'slaStatus',
        sortOrder: 'desc',
      };

      const result = await service.findAll(queryTicketDto, 'Admin', 'admin-1');

      expect(mockTicketRepository.findManySortedBySlaStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: { userId: 'admin-1', role: 'Admin' },
          sortOrder: 'desc',
          skip: 0,
          take: 10,
        }),
      );
      expect(mockTicketRepository.findManyForUser).not.toHaveBeenCalled();
      expect(result.data).toEqual(slaSortedTicketsDesc);
    });

    it('should still use findManyForUser when sortBy is not slaStatus (regression check)', async () => {
      mockTicketRepository.findManyForUser.mockResolvedValue(mockTickets);
      mockTicketRepository.countForUser.mockResolvedValue(1);

      const queryTicketDto: QueryTicketDto = {
        sortBy: 'createdAt',
        sortOrder: 'desc',
      };

      await service.findAll(queryTicketDto, 'Admin', 'admin-1');

      expect(mockTicketRepository.findManyForUser).toHaveBeenCalled();
      expect(mockTicketRepository.findManySortedBySlaStatus).not.toHaveBeenCalled();
    });

    it('should pass slaStatus filter to findManySortedBySlaStatus when combined with slaStatus sort', async () => {
      mockTicketRepository.findManySortedBySlaStatus.mockResolvedValue([]);
      mockTicketRepository.countForUser.mockResolvedValue(0);

      const queryTicketDto: QueryTicketDto = {
        sortBy: 'slaStatus',
        sortOrder: 'asc',
        slaStatus: [SLAStatus.Breached],
      };

      await service.findAll(queryTicketDto, 'Admin', 'admin-1');

      expect(mockTicketRepository.findManySortedBySlaStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ slaStatus: [SLAStatus.Breached] }),
        }),
      );
    });

    it('returns totalPages 1 for empty positive-limit results', async () => {
      mockTicketRepository.findManyForUser.mockResolvedValue([]);
      mockTicketRepository.countForUser.mockResolvedValue(0);

      const result = await service.findAll({ page: 1, limit: 10 }, 'Admin', 'admin-1');

      expect(result).toEqual({
        data: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 1 },
      });
    });
  });

  describe('updateStatus', () => {
    const ticketId = 'ticket-1';
    const userId = 'user-1';

    it('should successfully transition from Open to InProgress', async () => {
      const existingTicket = {
        id: ticketId,
        ticketNumber: 'TKT-001',
        subject: 'Test subject',
        status: TicketStatus.Open,
        assignedToId: 'agent-1',
        requesterId: 'requester-1',
      };

      const updatedTicket = {
        ...existingTicket,
        status: TicketStatus.InProgress,
      };

      mockTicketRepository.findById
        .mockResolvedValueOnce(existingTicket)
        .mockResolvedValueOnce(updatedTicket);
      mockTicketRepository.updateMany.mockResolvedValue({ count: 1 });

      const updateStatusDto: UpdateStatusDto = {
        status: TicketStatus.InProgress,
      };

      const result = await service.updateStatus(ticketId, updateStatusDto, userId, 'Admin');

      expect(mockTicketRepository.transaction).toHaveBeenCalled();

      expect(mockEventEmitter.emit).toHaveBeenCalledWith('ticket.status.updated', {
        ticketId,
        ticketNumber: 'TKT-001',
        subject: 'Test subject',
        oldStatus: TicketStatus.Open,
        newStatus: TicketStatus.InProgress,
        assignedToId: 'agent-1',
        requesterId: 'requester-1',
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

      mockTicketRepository.findById.mockResolvedValue(existingTicket);

      const updateStatusDto: UpdateStatusDto = {
        status: TicketStatus.Closed,
      };

      await expect(
        service.updateStatus(ticketId, updateStatusDto, userId, 'Admin'),
      ).rejects.toThrow(BadRequestException);

      expect(mockTicketRepository.updateMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when ticket does not exist', async () => {
      mockTicketRepository.findById.mockResolvedValue(null);

      const updateStatusDto: UpdateStatusDto = {
        status: TicketStatus.InProgress,
      };

      await expect(
        service.updateStatus(ticketId, updateStatusDto, userId, 'Admin'),
      ).rejects.toThrow(NotFoundException);

      expect(mockTicketRepository.updateMany).not.toHaveBeenCalled();
    });

    it('should set resolvedAt when transitioning to Resolved', async () => {
      const existingTicket = {
        id: ticketId,
        ticketNumber: 'TKT-001',
        status: TicketStatus.InProgress,
        assignedToId: 'agent-1',
      };

      mockTicketRepository.findById
        .mockResolvedValueOnce(existingTicket)
        .mockImplementation(async () => ({
          ...existingTicket,
          status: TicketStatus.Resolved,
        }));
      mockTicketRepository.updateMany.mockImplementation(async (_where: unknown, data: any) => ({
        count: data.resolvedAt ? 1 : 0,
      }));
      mockTicketRepository.update.mockImplementation(async (_id: string, data: any) => ({
        ...existingTicket,
        status: TicketStatus.Resolved,
        resolvedAt: data.resolvedAt,
      }));

      const updateStatusDto: UpdateStatusDto = {
        status: TicketStatus.Resolved,
      };

      await service.updateStatus(ticketId, updateStatusDto, userId, 'Admin');

      expect(mockTicketRepository.transaction).toHaveBeenCalled();
    });

    it('should set closedAt when transitioning to Closed', async () => {
      const existingTicket = {
        id: ticketId,
        ticketNumber: 'TKT-001',
        status: TicketStatus.Resolved,
        assignedToId: 'agent-1',
      };

      mockTicketRepository.findById
        .mockResolvedValueOnce(existingTicket)
        .mockImplementation(async () => ({
          ...existingTicket,
          status: TicketStatus.Closed,
        }));
      mockTicketRepository.updateMany.mockImplementation(async (_where: unknown, data: any) => ({
        count: data.closedAt ? 1 : 0,
      }));
      mockTicketRepository.update.mockImplementation(async (_id: unknown, data: any) => ({
        ...existingTicket,
        status: TicketStatus.Closed,
        closedAt: data.closedAt,
      }));

      const updateStatusDto: UpdateStatusDto = {
        status: TicketStatus.Closed,
      };

      await service.updateStatus(ticketId, updateStatusDto, userId, 'Admin');

      expect(mockTicketRepository.transaction).toHaveBeenCalled();
    });

    it('should throw ConflictException when conditional status update affects no rows', async () => {
      const existingTicket = {
        id: ticketId,
        ticketNumber: 'TKT-001',
        subject: 'Test subject',
        status: TicketStatus.Open,
        assignedToId: 'agent-1',
        requesterId: 'requester-1',
      };

      mockTicketRepository.findById.mockResolvedValue(existingTicket);
      mockTicketRepository.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateStatus(ticketId, { status: TicketStatus.InProgress }, userId, 'Admin'),
      ).rejects.toThrow('Ticket status changed');
    });
  });

  describe('updatePriority', () => {
    const ticketId = 'ticket-1';
    const userId = 'admin-1';
    const createdAt = new Date('2026-06-18T12:00:00Z');
    const now = new Date('2026-06-18T12:10:00Z');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should use SLAService fallback config instead of hardcoded 24h when exact priority config is absent', async () => {
      const existingTicket = {
        id: ticketId,
        ticketNumber: 'TKT-001',
        priority: Priority.Low,
        categoryId: 'cat-1',
        createdAt,
        category: { slaConfigs: [] },
      };
      const fallbackConfig = {
        id: 'sla-fallback',
        categoryId: 'cat-1',
        priority: Priority.Medium,
        responseTimeMinutes: 30,
        resolutionTimeMinutes: 60,
        isActive: true,
      };
      const expectedSlaDueAt = new Date(createdAt.getTime() + 60 * 60 * 1000);

      mockTicketRepository.findById.mockResolvedValue(existingTicket);
      mockSlaService.getSLAConfig.mockResolvedValueOnce(fallbackConfig);
      mockTicketRepository.update.mockImplementation(async (_id: string, data: any) => ({
        ...existingTicket,
        ...data,
      }));

      await service.updatePriority(ticketId, { priority: Priority.High }, userId);

      expect(mockSlaService.getSLAConfig).toHaveBeenCalledWith('cat-1', Priority.High);
      expect(mockTicketRepository.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          priority: Priority.High,
          slaDueAt: expectedSlaDueAt,
          slaStatus: SLAStatus.OnTrack,
        }),
      );
    });
  });

  describe('exportCsvToResponse', () => {
    function makeResponse() {
      return {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
        writableEnded: false,
      } as any;
    }

    it('should honor allowed sortBy and sortOrder with id as deterministic secondary sort', async () => {
      const res = makeResponse();
      mockTicketRepository.findManyForUser.mockResolvedValueOnce([
        {
          id: 'ticket-1',
          ticketNumber: 'TKT-001',
          subject: 'VPN issue',
          status: TicketStatus.Open,
          priority: Priority.High,
          category: { name: 'Network' },
          subCategory: null,
          requester: { name: 'Requester' },
          assignedTo: null,
          createdAt: new Date('2026-06-18T12:00:00Z'),
          resolvedAt: null,
          slaStatus: SLAStatus.OnTrack,
        },
      ]).mockResolvedValueOnce([]);

      await service.exportCsvToResponse(
        res,
        { sortBy: 'priority', sortOrder: 'asc' },
        'Admin',
        'admin-1',
      );

      expect(mockTicketRepository.findManyForUser).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ priority: 'asc' }, { id: 'asc' }],
          skip: 0,
          take: 500,
        }),
        { userId: 'admin-1', role: 'Admin' },
      );
      expect(res.end).toHaveBeenCalled();
    });

    it('should use findManySortedBySlaStatus when sortBy=slaStatus', async () => {
      const res = makeResponse();
      mockTicketRepository.findManySortedBySlaStatus.mockResolvedValueOnce([
        {
          id: 'ticket-1',
          ticketNumber: 'TKT-001',
          subject: 'Breached ticket',
          status: TicketStatus.Open,
          priority: Priority.High,
          category: { name: 'Network' },
          subCategory: null,
          requester: { name: 'Requester' },
          assignedTo: null,
          createdAt: new Date('2026-06-18T12:00:00Z'),
          resolvedAt: null,
          slaStatus: SLAStatus.Breached,
        },
      ]).mockResolvedValueOnce([]);

      await service.exportCsvToResponse(
        res,
        { sortBy: 'slaStatus', sortOrder: 'asc' },
        'Admin',
        'admin-1',
      );

      expect(mockTicketRepository.findManySortedBySlaStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: { userId: 'admin-1', role: 'Admin' },
          sortOrder: 'asc',
          skip: 0,
          take: 500,
        }),
      );
      expect(mockTicketRepository.findManyForUser).not.toHaveBeenCalled();
      expect(res.end).toHaveBeenCalled();
    });
  });
});
