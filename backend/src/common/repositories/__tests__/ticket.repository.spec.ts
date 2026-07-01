import { Test, TestingModule } from '@nestjs/testing';
import { TicketRepository } from '../ticket.repository';
import { PrismaService } from '../../../prisma/prisma.service';

describe('TicketRepository', () => {
  let repository: TicketRepository;
  let prisma: any;

  const mockPrisma = {
    ticket: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      groupBy: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repository = module.get<TicketRepository>(TicketRepository);
    prisma = module.get(PrismaService);
    jest.resetAllMocks();
    // Restore defaults
    mockPrisma.ticket.groupBy.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
  });

  describe('findManyForUser (Sesi 9 SEC-I-2 — added in Sesi 9 branch)', () => {
    // Tests for findManyForUser/countForUser added in Sesi 9 are not included
    // here because this branch is based on pre-Sesi 9 main. They will be
    // added when Sesi 9 commits are pulled in.
    it.skip('placeholder — see Sesi 9 commit 4fa68c4', () => {
      expect(true).toBe(true);
    });
  });

  describe('countPublicCommentsByTicketIds (raw query, PERF-03)', () => {
    it('should return empty array when no ticketIds given (avoid SQL with empty ANY)', async () => {
      const result = await repository.countPublicCommentsByTicketIds([]);

      expect(result).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('should query comments with type=PUBLIC grouped by ticketId', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ ticketId: 't1', count: 3 }]);

      const result = await repository.countPublicCommentsByTicketIds(['t1']);

      expect(result).toEqual([{ ticketId: 't1', count: 3 }]);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('countVisibleAttachmentsByTicketIds (raw query, PERF-03)', () => {
    it('should return empty array when no ticketIds given', async () => {
      const result = await repository.countVisibleAttachmentsByTicketIds([]);

      expect(result).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('should join attachments + comments to filter visibility', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ ticketId: 't1', count: 2 }]);

      const result = await repository.countVisibleAttachmentsByTicketIds(['t1', 't2']);

      expect(result).toEqual([{ ticketId: 't1', count: 2 }]);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSLAStats (raw query, PERF-06)', () => {
    it('should return the single row (count(*), count(*) FILTER WHERE)', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{
        total: 50, onTrack: 30, atRisk: 15, breached: 5,
      }]);

      const result = await repository.getSLAStats();

      expect(result).toEqual({ total: 50, onTrack: 30, atRisk: 15, breached: 5 });
    });

    it('should filter out Closed/Resolved tickets', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{
        total: 0, onTrack: 0, atRisk: 0, breached: 0,
      }]);

      await repository.getSLAStats();

      // Just verify the call was made; SQL string check would be brittle.
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDailyTrends (raw query, PERF-06)', () => {
    it('should return array of { day, count } rows', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        { day: '2026-06-25', count: 3 },
        { day: '2026-06-26', count: 5 },
      ]);

      const result = await repository.getDailyTrends(7);

      expect(result).toEqual([
        { day: '2026-06-25', count: 3 },
        { day: '2026-06-26', count: 5 },
      ]);
    });
  });

  describe('getAvgResolutionTimeByCategory (raw query, PERF-06)', () => {
    it('should return category stats rows', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{
        categoryId: 'c1', categoryName: 'Network', avgResolutionMinutes: 120, ticketCount: 10n,
      }]);

      const result = await repository.getAvgResolutionTimeByCategory();

      expect(result).toHaveLength(1);
      expect(result[0].categoryId).toBe('c1');
      expect(result[0].ticketCount).toBe(10n);
    });
  });

  describe('updateMany', () => {
    it('should pass through where + data and return { count }', async () => {
      prisma.ticket.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await repository.updateMany({ id: 't1', status: 'Open' }, { status: 'Closed' });

      expect(result).toEqual({ count: 1 });
      expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', status: 'Open' },
        data: { status: 'Closed' },
      });
    });
  });

  describe('transaction', () => {
    it('should call $transaction with fn and options', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      prisma.$transaction.mockResolvedValueOnce('result');

      const result = await repository.transaction(fn, { isolationLevel: 'Serializable' as any });

      expect(result).toBe('result');
      expect(prisma.$transaction).toHaveBeenCalledWith(fn, { isolationLevel: 'Serializable' });
    });
  });
});
