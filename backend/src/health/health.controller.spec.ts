import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: any;
  let redis: any;

  const mockPrisma = { healthCheck: jest.fn() };
  const mockRedis = { ping: jest.fn(), get: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();
    controller = module.get<HealthController>(HealthController);
    prisma = module.get(PrismaService);
    redis = module.get(RedisService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns healthy when DB and Redis are up', async () => {
    mockPrisma.healthCheck.mockResolvedValue(true);
    mockRedis.ping.mockResolvedValue(true);
    mockRedis.get.mockResolvedValue(null);

    const body = await controller.check();
    expect(body.status).toBe('healthy');
    expect(body.checks.database).toBe('healthy');
    expect(body.checks.redis).toBe('healthy');
    expect(body.maintenance.enabled).toBe(false);
  });

  it('returns unhealthy when DB is down', async () => {
    mockPrisma.healthCheck.mockResolvedValue(false);
    mockRedis.ping.mockResolvedValue(true);

    await expect(controller.check()).rejects.toThrow(ServiceUnavailableException);
    await expect(controller.check()).rejects.toMatchObject({
      response: { checks: { database: 'unhealthy' } },
    });
  });

  it('handles Redis being unreachable', async () => {
    mockPrisma.healthCheck.mockResolvedValue(true);
    mockRedis.ping.mockRejectedValue(new Error('timeout'));

    await expect(controller.check()).rejects.toThrow(ServiceUnavailableException);
    await expect(controller.check()).rejects.toMatchObject({
      response: { checks: { redis: 'unhealthy' } },
    });
  });
});
