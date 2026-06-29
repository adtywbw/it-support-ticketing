import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from '../dashboard.service';
import { TicketRepository } from '../../common/repositories/ticket.repository';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('DashboardService — cache invalidation', () => {
  let service: DashboardService;
  let redisService: any;

  const mockTicketRepository = {
    groupBy: jest.fn().mockResolvedValue([]),
  };

  const mockPrismaService = {
    $queryRaw: jest.fn().mockResolvedValue([{ total: 0, onTrack: 0, atRisk: 0, breached: 0 }]),
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
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    redisService = module.get(RedisService);

    jest.clearAllMocks();
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
});
