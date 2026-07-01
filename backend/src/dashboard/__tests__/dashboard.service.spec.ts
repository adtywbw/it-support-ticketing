import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from '../dashboard.service';
import { TicketRepository } from '../../common/repositories/ticket.repository';
import { RedisService } from '../../redis/redis.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let redisService: any;
  let ticketRepository: any;

  const mockTicketRepository = {
    groupBy: jest.fn().mockResolvedValue([]),
    getSLAStats: jest.fn().mockResolvedValue({ total: 0, onTrack: 0, atRisk: 0, breached: 0 }),
    getDailyTrends: jest.fn().mockResolvedValue([]),
    getAvgResolutionTimeByCategory: jest.fn().mockResolvedValue([]),
  };

  const mockRedisService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
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
    // Restore default mock implementations after reset
    mockTicketRepository.groupBy.mockResolvedValue([]);
    mockTicketRepository.getSLAStats.mockResolvedValue({ total: 0, onTrack: 0, atRisk: 0, breached: 0 });
    mockTicketRepository.getDailyTrends.mockResolvedValue([]);
    mockTicketRepository.getAvgResolutionTimeByCategory.mockResolvedValue([]);
    mockRedisService.get.mockResolvedValue(null);
    mockRedisService.set.mockResolvedValue(undefined);
    mockRedisService.del.mockResolvedValue(undefined);
  });

  describe('invalidateCache()', () => {
    it('should delete the dashboard cache key from Redis', async () => {
      await service.invalidateCache();

      expect(redisService.del).toHaveBeenCalledWith('dashboard:stats:v1');
    });
  });

  describe('handleTicketChanged() — event-driven invalidation', () => {
    it('should invalidate cache when called', async () => {
      await service.handleTicketChanged();

      expect(redisService.del).toHaveBeenCalledWith('dashboard:stats:v1');
    });

    it('should not throw if Redis del fails', async () => {
      redisService.del.mockRejectedValue(new Error('Redis down'));

      await expect(service.handleTicketChanged()).resolves.not.toThrow();
    });
  });

  describe('getStats() — cache behavior', () => {
    it('should return cached value if Redis has the key', async () => {
      const cached = { statusCounts: { Open: 5 } };
      redisService.get.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await service.getStats();

      expect(result).toEqual(cached);
      expect(ticketRepository.groupBy).not.toHaveBeenCalled();
    });

    it('should compute stats on cache miss and store in Redis with 30s TTL', async () => {
      redisService.get.mockResolvedValueOnce(null);

      await service.getStats();

      expect(redisService.set).toHaveBeenCalledWith(
        'dashboard:stats:v1',
        expect.any(String),
        30,
      );
    });
  });

  describe('getStats() — status counts (all enum values initialized to 0)', () => {
    it('should return all TicketStatus values with default 0', async () => {
      redisService.get.mockResolvedValueOnce(null);

      const result = await service.getStats();

      expect(result.statusCounts).toEqual({
        Open: 0,
        InProgress: 0,
        OnHold: 0,
        Resolved: 0,
        Closed: 0,
      });
    });

    it('should populate counts from groupBy result', async () => {
      redisService.get.mockResolvedValueOnce(null);
      ticketRepository.groupBy.mockResolvedValueOnce([
        { status: 'Open', _count: { id: 3 } },
        { status: 'Resolved', _count: { id: 7 } },
      ]);

      const result = await service.getStats();

      expect(result.statusCounts).toEqual({
        Open: 3,
        InProgress: 0,
        OnHold: 0,
        Resolved: 7,
        Closed: 0,
      });
    });
  });

  describe('getStats() — SLA stats + compliance rate', () => {
    it('should return 100% compliance when no active tickets', async () => {
      redisService.get.mockResolvedValueOnce(null);
      ticketRepository.getSLAStats.mockResolvedValueOnce({ total: 0, onTrack: 0, atRisk: 0, breached: 0 });

      const result = await service.getStats();

      expect(result.slaStats.complianceRate).toBe(100);
    });

    it('should compute compliance rate as onTrack/total percentage', async () => {
      redisService.get.mockResolvedValueOnce(null);
      ticketRepository.getSLAStats.mockResolvedValueOnce({ total: 10, onTrack: 7, atRisk: 2, breached: 1 });

      const result = await service.getStats();

      expect(result.slaStats).toEqual({
        total: 10,
        onTrack: 7,
        atRisk: 2,
        breached: 1,
        complianceRate: 70,
      });
    });
  });

  describe('getStats() — daily trends (7d + 30d parallel)', () => {
    it('should query getDailyTrends twice (7 + 30 days) in parallel', async () => {
      redisService.get.mockResolvedValueOnce(null);

      await service.getStats();

      expect(ticketRepository.getDailyTrends).toHaveBeenCalledTimes(2);
      // Each call passes a [from, to) range
      for (const call of ticketRepository.getDailyTrends.mock.calls) {
        expect(call[0]).toBeInstanceOf(Date);
        expect(call[1]).toBeInstanceOf(Date);
      }
    });

    it('should expose both 7d and 30d in result', async () => {
      redisService.get.mockResolvedValueOnce(null);
      ticketRepository.getDailyTrends
        .mockResolvedValueOnce([{ day: '2026-06-25', count: 3 }])
        .mockResolvedValueOnce([{ day: '2026-06-01', count: 5 }]);

      const result = await service.getStats();

      // Service fills missing days with 0; just check the reported counts.
      expect(result.dailyTrends.last7Days['2026-06-25']).toBe(3);
      expect(result.dailyTrends.last30Days['2026-06-01']).toBe(5);
    });
  });

  describe('getStats() — category resolution time', () => {
    it('should pass through ticketCount as Number (not BigInt)', async () => {
      redisService.get.mockResolvedValueOnce(null);
      ticketRepository.getAvgResolutionTimeByCategory.mockResolvedValueOnce([
        { categoryId: 'c1', categoryName: 'Network', avgResolutionMinutes: 120, ticketCount: 42n },
      ]);

      const result = await service.getStats();

      expect(result.categoryResolution).toEqual([
        { categoryId: 'c1', categoryName: 'Network', avgResolutionMinutes: 120, ticketCount: 42 },
      ]);
      expect(typeof result.categoryResolution[0].ticketCount).toBe('number');
    });
  });
});
