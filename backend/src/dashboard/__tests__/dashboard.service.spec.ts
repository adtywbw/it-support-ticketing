import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Priority, SLAStatus, TicketStatus } from '@prisma/client';
import { DashboardService } from '../dashboard.service';
import { TicketRepository } from '../../common/repositories/ticket.repository';
import { RedisService } from '../../redis/redis.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let redisService: any;
  let ticketRepository: any;

  const mockTicketRepository = {
    getDashboardCurrentSnapshot: jest.fn(),
    getDashboardAttentionTickets: jest.fn(),
    getDashboardStatusCounts: jest.fn(),
    getDashboardPriorityCounts: jest.fn(),
    getDashboardSLAStatsForRange: jest.fn(),
    getDailyTrends: jest.fn(),
    getAvgResolutionTimeByCategoryForRange: jest.fn(),
    getTopCategories: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    deleteByPattern: jest.fn(),
  };

  const baseCurrent = {
    activeTickets: 4,
    open: 2,
    inProgress: 1,
    slaRisk: 1,
    unassigned: 1,
  };

  const baseAttention = {
    slaRisk: [
      {
        id: 'ticket-1',
        ticketNumber: 'TKT-001',
        subject: 'VPN down',
        priority: Priority.Critical,
        status: TicketStatus.Open,
        slaStatus: SLAStatus.Breached,
        slaDueAt: new Date('2026-07-01T12:00:00.000Z'),
        assignedTo: null,
        createdAt: new Date('2026-07-01T08:00:00.000Z'),
      },
    ],
    highPriority: [],
    unassigned: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: TicketRepository, useValue: mockTicketRepository },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    redisService = module.get(RedisService);
    ticketRepository = module.get(TicketRepository);

    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T10:00:00.000Z'));

    ticketRepository.getDashboardCurrentSnapshot.mockResolvedValue(baseCurrent);
    ticketRepository.getDashboardAttentionTickets.mockResolvedValue(baseAttention);
    ticketRepository.getDashboardStatusCounts.mockResolvedValue([{ status: TicketStatus.Open, _count: { id: 2 } }]);
    ticketRepository.getDashboardPriorityCounts.mockResolvedValue([{ priority: Priority.Critical, _count: { id: 1 } }]);
    ticketRepository.getDashboardSLAStatsForRange.mockResolvedValue({ total: 4, onTrack: 3, atRisk: 1, breached: 0 });
    ticketRepository.getDailyTrends.mockResolvedValue([{ day: '2026-07-02', count: 2 }]);
    ticketRepository.getAvgResolutionTimeByCategoryForRange.mockResolvedValue([
      { categoryId: 'cat-1', categoryName: 'Network', avgResolutionMinutes: 90, ticketCount: 2n },
    ]);
    ticketRepository.getTopCategories.mockResolvedValue([{ categoryId: 'cat-1', categoryName: 'Network', count: 3n }]);
    redisService.get.mockResolvedValue(null);
    redisService.set.mockResolvedValue(undefined);
    redisService.deleteByPattern.mockResolvedValue(1);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('invalidateCache()', () => {
    it('deletes all v2 dashboard cache keys', async () => {
      await service.invalidateCache();

      expect(redisService.deleteByPattern).toHaveBeenCalledWith('dashboard:stats:v2:*');
    });

    it('logs warning and does not throw when Redis deleteByPattern fails', async () => {
      redisService.deleteByPattern.mockRejectedValueOnce(new Error('Redis down'));

      await expect(service.handleTicketChanged()).resolves.not.toThrow();
    });
  });

  describe('getStats() range and cache behavior', () => {
    it('defaults to 30d and writes the v2 30d cache key', async () => {
      const result = await service.getStats({});

      expect(redisService.get).toHaveBeenCalledWith('dashboard:stats:v2:30d');
      expect(redisService.set).toHaveBeenCalledWith('dashboard:stats:v2:30d', expect.any(String), 30);
      expect(result.analytics.range).toEqual({ preset: '30d', from: '2026-06-03', to: '2026-07-02' });
    });

    it('uses separate cache keys for preset ranges', async () => {
      await service.getStats({ range: '7d' });
      await service.getStats({ range: '90d' });

      expect(redisService.get).toHaveBeenNthCalledWith(1, 'dashboard:stats:v2:7d');
      expect(redisService.get).toHaveBeenNthCalledWith(2, 'dashboard:stats:v2:90d');
    });

    it('uses from and to in the custom cache key', async () => {
      const result = await service.getStats({ range: 'custom', from: '2026-06-01', to: '2026-06-30' });

      expect(redisService.get).toHaveBeenCalledWith('dashboard:stats:v2:custom:2026-06-01:2026-06-30');
      expect(result.analytics.range).toEqual({ preset: 'custom', from: '2026-06-01', to: '2026-06-30' });
    });

    it('returns cached JSON without querying repositories', async () => {
      const cached = { current: baseCurrent, attention: { slaRisk: [], highPriority: [], unassigned: [] }, analytics: { range: { preset: '30d', from: '2026-06-03', to: '2026-07-02' } } };
      redisService.get.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await service.getStats({ range: '30d' });

      expect(result).toEqual(cached);
      expect(ticketRepository.getDashboardCurrentSnapshot).not.toHaveBeenCalled();
    });

    it('returns current snapshot independent from analytics range', async () => {
      const result = await service.getStats({ range: '7d' });

      expect(result.current).toEqual(baseCurrent);
      expect(ticketRepository.getDashboardCurrentSnapshot).toHaveBeenCalledWith();
      expect(ticketRepository.getDashboardStatusCounts).toHaveBeenCalledWith(expect.any(Date), expect.any(Date));
    });

    it('serializes attention ticket dates and caps each attention list at five items', async () => {
      const sixTickets = Array.from({ length: 6 }, (_, index) => ({
        id: `ticket-${index + 1}`,
        ticketNumber: `TKT-00${index + 1}`,
        subject: `Issue ${index + 1}`,
        priority: Priority.Critical,
        status: TicketStatus.Open,
        slaStatus: SLAStatus.Breached,
        slaDueAt: new Date('2026-07-01T12:00:00.000Z'),
        assignedTo: null,
        createdAt: new Date('2026-07-01T08:00:00.000Z'),
      }));
      ticketRepository.getDashboardAttentionTickets.mockResolvedValueOnce({
        slaRisk: sixTickets,
        highPriority: sixTickets,
        unassigned: sixTickets,
      });

      const result = await service.getStats({ range: '30d' });

      expect(result.attention.slaRisk).toHaveLength(5);
      expect(result.attention.slaRisk[0].createdAt).toBe('2026-07-01T08:00:00.000Z');
      expect(result.attention.slaRisk[0].slaDueAt).toBe('2026-07-01T12:00:00.000Z');
    });

    it('builds analytics counts with zeroes for missing enum values', async () => {
      const result = await service.getStats({ range: '30d' });

      expect(result.analytics.statusCounts).toEqual({
        Open: 2,
        InProgress: 0,
        OnHold: 0,
        Resolved: 0,
        Closed: 0,
      });
      expect(result.analytics.priorityCounts).toEqual({
        Low: 0,
        Medium: 0,
        High: 0,
        Critical: 1,
      });
    });

    it('calculates SLA compliance as onTrack divided by total', async () => {
      ticketRepository.getDashboardSLAStatsForRange.mockResolvedValueOnce({ total: 10, onTrack: 7, atRisk: 2, breached: 1 });

      const result = await service.getStats({ range: '30d' });

      expect(result.analytics.slaComplianceRate).toBe(70);
    });

    it('returns 100 SLA compliance when no tickets are tracked in the range', async () => {
      ticketRepository.getDashboardSLAStatsForRange.mockResolvedValueOnce({ total: 0, onTrack: 0, atRisk: 0, breached: 0 });

      const result = await service.getStats({ range: '30d' });

      expect(result.analytics.slaComplianceRate).toBe(100);
    });
  });

  describe('getStats() validation', () => {
    it('rejects custom ranges without from and to', async () => {
      await expect(service.getStats({ range: 'custom' })).rejects.toThrow(BadRequestException);
    });

    it('rejects custom ranges where from is after to', async () => {
      await expect(service.getStats({ range: 'custom', from: '2026-07-10', to: '2026-07-01' })).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid direct service range values', async () => {
      await expect(service.getStats({ range: '365d' as any })).rejects.toThrow(BadRequestException);
    });
  });
});
