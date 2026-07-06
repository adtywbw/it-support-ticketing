import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SLAService } from './sla.service';
import { SlaConfigRepository } from '../common/repositories/sla-config.repository';
import { TicketRepository } from '../common/repositories/ticket.repository';
import { CategoryRepository } from '../common/repositories/category.repository';
import { RedisService } from '../redis/redis.service';
import { Priority, SLAStatus, TicketStatus } from '@prisma/client';

describe('SLAService', () => {
  let service: SLAService;
  let slaConfigRepository: any;
  let ticketRepository: any;
  let redisService: any;
  let categoryRepository: any;

  const mockSlaConfigRepository = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockTicketRepository = {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    recalculateSlaBatch: jest.fn(),
  };

  const mockRedisService = {
    setNx: jest.fn(),
    del: jest.fn(),
    eval: jest.fn(),
  };

  const mockCategoryRepository = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SLAService,
        { provide: SlaConfigRepository, useValue: mockSlaConfigRepository },
        { provide: TicketRepository, useValue: mockTicketRepository },
        { provide: RedisService, useValue: mockRedisService },
        { provide: CategoryRepository, useValue: mockCategoryRepository },
      ],
    }).compile();

    service = module.get<SLAService>(SLAService);
    slaConfigRepository = module.get(SlaConfigRepository);
    ticketRepository = module.get(TicketRepository);
    redisService = module.get(RedisService);
    categoryRepository = module.get(CategoryRepository);

    jest.resetAllMocks();
    ticketRepository.findMany.mockResolvedValue([]);
    ticketRepository.update.mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('create()', () => {
    const newConfig = {
      id: 'config-1',
      categoryId: 'cat-1',
      priority: Priority.High,
      responseTimeMinutes: 60,
      resolutionTimeMinutes: 240,
      isActive: true,
    };

    it('should recalculate related non-terminal tickets after creating a config', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
      categoryRepository.findById.mockResolvedValue({ id: 'cat-1' });
      slaConfigRepository.create.mockResolvedValue(newConfig);
      ticketRepository.findMany
        .mockResolvedValueOnce([
          { id: 'ticket-1' },
          { id: 'ticket-2' },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.create({
        categoryId: 'cat-1',
        priority: Priority.High,
        responseTimeMinutes: 60,
        resolutionTimeMinutes: 240,
      });

      expect(result).toEqual(newConfig);
      expect(ticketRepository.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: {
            categoryId: 'cat-1',
            priority: Priority.High,
            status: { notIn: [TicketStatus.Resolved, TicketStatus.Closed] },
          },
          select: { id: true },
          take: 500,
          orderBy: { id: 'asc' },
        }),
      );
      expect(ticketRepository.recalculateSlaBatch).toHaveBeenCalledWith(
        ['ticket-1', 'ticket-2'],
        240,
        0.2,
        new Date('2026-01-01T12:00:00.000Z'),
      );
    });

    it('should throw NotFoundException and skip recalculation when category does not exist', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({
          categoryId: 'missing-cat',
          priority: Priority.High,
          responseTimeMinutes: 60,
          resolutionTimeMinutes: 240,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(slaConfigRepository.create).not.toHaveBeenCalled();
      expect(ticketRepository.findMany).not.toHaveBeenCalled();
      expect(ticketRepository.update).not.toHaveBeenCalled();
    });

    it('should map duplicate category-priority configs to ConflictException and skip recalculation', async () => {
      categoryRepository.findById.mockResolvedValue({ id: 'cat-1' });
      slaConfigRepository.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.create({
          categoryId: 'cat-1',
          priority: Priority.High,
          responseTimeMinutes: 60,
          resolutionTimeMinutes: 240,
        }),
      ).rejects.toThrow(ConflictException);

      expect(ticketRepository.findMany).not.toHaveBeenCalled();
      expect(ticketRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    const existingConfig = {
      id: 'config-1',
      categoryId: 'cat-1',
      priority: Priority.High,
      responseTimeMinutes: 60,
      resolutionTimeMinutes: 240,
      isActive: true,
    };

    it('should throw NotFoundException when config does not exist', async () => {
      slaConfigRepository.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { responseTimeMinutes: 30 }),
      ).rejects.toThrow(NotFoundException);
      expect(slaConfigRepository.findUnique).toHaveBeenCalledWith({ id: 'nonexistent' });
    });

    it('should update when both fields provided and valid', async () => {
      slaConfigRepository.findUnique.mockResolvedValue(existingConfig);
      slaConfigRepository.update.mockResolvedValue({ ...existingConfig, responseTimeMinutes: 120, resolutionTimeMinutes: 480 });

      const result = await service.update('config-1', { responseTimeMinutes: 120, resolutionTimeMinutes: 480 });

      expect(result.responseTimeMinutes).toBe(120);
      expect(result.resolutionTimeMinutes).toBe(480);
      expect(slaConfigRepository.update).toHaveBeenCalledWith('config-1', { responseTimeMinutes: 120, resolutionTimeMinutes: 480 });
    });

    it('should throw BadRequestException when both fields provided but resolution < response', async () => {
      slaConfigRepository.findUnique.mockResolvedValue(existingConfig);

      await expect(
        service.update('config-1', { responseTimeMinutes: 300, resolutionTimeMinutes: 120 }),
      ).rejects.toThrow(BadRequestException);

      expect(slaConfigRepository.update).not.toHaveBeenCalled();
    });

    it('should validate merged values when only responseTimeMinutes is patched', async () => {
      slaConfigRepository.findUnique.mockResolvedValue(existingConfig);

      // Patch responseTimeMinutes to 300, which exceeds existing resolutionTimeMinutes (240)
      await expect(
        service.update('config-1', { responseTimeMinutes: 300 }),
      ).rejects.toThrow(BadRequestException);

      expect(slaConfigRepository.update).not.toHaveBeenCalled();
    });

    it('should allow patching only responseTimeMinutes when merged values are valid', async () => {
      slaConfigRepository.findUnique.mockResolvedValue(existingConfig);
      slaConfigRepository.update.mockResolvedValue({ ...existingConfig, responseTimeMinutes: 120 });

      const result = await service.update('config-1', { responseTimeMinutes: 120 });

      expect(result.responseTimeMinutes).toBe(120);
      expect(slaConfigRepository.update).toHaveBeenCalledWith('config-1', { responseTimeMinutes: 120 });
      expect(ticketRepository.findMany).toHaveBeenCalled();
    });

    it('should validate merged values when only resolutionTimeMinutes is patched', async () => {
      slaConfigRepository.findUnique.mockResolvedValue(existingConfig);

      // Patch resolutionTimeMinutes to 30, which is less than existing responseTimeMinutes (60)
      await expect(
        service.update('config-1', { resolutionTimeMinutes: 30 }),
      ).rejects.toThrow(BadRequestException);

      expect(slaConfigRepository.update).not.toHaveBeenCalled();
    });

    it('should allow patching only resolutionTimeMinutes when merged values are valid', async () => {
      slaConfigRepository.findUnique.mockResolvedValue(existingConfig);
      slaConfigRepository.update.mockResolvedValue({ ...existingConfig, resolutionTimeMinutes: 480 });

      const result = await service.update('config-1', { resolutionTimeMinutes: 480 });

      expect(result.resolutionTimeMinutes).toBe(480);
      expect(slaConfigRepository.update).toHaveBeenCalledWith('config-1', { resolutionTimeMinutes: 480 });
      expect(ticketRepository.findMany).toHaveBeenCalled();
    });

    it('should allow patching isActive without time validation', async () => {
      slaConfigRepository.findUnique.mockResolvedValue(existingConfig);
      slaConfigRepository.update.mockResolvedValue({ ...existingConfig, isActive: false });

      const result = await service.update('config-1', { isActive: false });

      expect(result.isActive).toBe(false);
      expect(slaConfigRepository.update).toHaveBeenCalledWith('config-1', { isActive: false });
    });

    it('should recalculate related tickets when timing fields are updated', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
      const updatedConfig = {
        ...existingConfig,
        responseTimeMinutes: 120,
        resolutionTimeMinutes: 480,
      };
      slaConfigRepository.findUnique.mockResolvedValue(existingConfig);
      slaConfigRepository.update.mockResolvedValue(updatedConfig);
      ticketRepository.findMany
        .mockResolvedValueOnce([
          { id: 'ticket-1' },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.update('config-1', {
        responseTimeMinutes: 120,
        resolutionTimeMinutes: 480,
      });

      expect(result).toEqual(updatedConfig);
      expect(ticketRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            categoryId: 'cat-1',
            priority: Priority.High,
            status: { notIn: [TicketStatus.Resolved, TicketStatus.Closed] },
          },
        }),
      );
      expect(ticketRepository.recalculateSlaBatch).toHaveBeenCalledWith(
        ['ticket-1'],
        480,
        0.2,
        new Date('2026-01-01T12:00:00.000Z'),
      );
    });

    it('should not recalculate tickets when only isActive is updated', async () => {
      slaConfigRepository.findUnique.mockResolvedValue(existingConfig);
      slaConfigRepository.update.mockResolvedValue({ ...existingConfig, isActive: false });

      await service.update('config-1', { isActive: false });

      expect(ticketRepository.findMany).not.toHaveBeenCalled();
      expect(ticketRepository.recalculateSlaBatch).not.toHaveBeenCalled();
    });

    it('should allow equal response and resolution times', async () => {
      slaConfigRepository.findUnique.mockResolvedValue(existingConfig);
      slaConfigRepository.update.mockResolvedValue({ ...existingConfig, responseTimeMinutes: 120, resolutionTimeMinutes: 120 });

      const result = await service.update('config-1', { responseTimeMinutes: 120, resolutionTimeMinutes: 120 });

      expect(result.responseTimeMinutes).toBe(120);
      expect(result.resolutionTimeMinutes).toBe(120);
    });
  });

  describe('checkSLA() cron', () => {
    // Helper to build a ticket row for cron iteration
    const makeTicket = (overrides: any = {}) => ({
      id: 't-1',
      ticketNumber: 'TKT-001',
      priority: Priority.High,
      status: 'Open',
      slaDueAt: new Date(Date.now() + 60 * 60 * 1000), // 1h in future
      slaStatus: 'OnTrack',
      createdAt: new Date(),
      category: {
        slaConfigs: [
          { priority: Priority.High, isActive: true, resolutionTimeMinutes: 60 },
        ],
      },
      ...overrides,
    });

    it('should acquire lock via SET NX EX 300', async () => {
      redisService.setNx.mockResolvedValueOnce(true);
      redisService.eval.mockResolvedValueOnce(1);
      ticketRepository.findMany.mockResolvedValueOnce([]);

      await service.checkSLA();

      expect(redisService.setNx).toHaveBeenCalledWith(
        'sla:check:lock',
        expect.stringMatching(/^lock:\d+:.+/),
        300,
      );
    });

    it('should skip performSLACheck if lock not acquired (concurrent run)', async () => {
      redisService.setNx.mockResolvedValueOnce(false);

      await service.checkSLA();

      expect(ticketRepository.findMany).not.toHaveBeenCalled();
    });

    it('should release lock via compare-and-delete Lua in finally', async () => {
      redisService.setNx.mockResolvedValueOnce(true);
      ticketRepository.findMany.mockResolvedValueOnce([]);

      await service.checkSLA();

      expect(redisService.eval).toHaveBeenCalledTimes(1);
      const [script, keys, args] = redisService.eval.mock.calls[0];
      expect(keys).toEqual(['sla:check:lock']);
      expect(args).toHaveLength(1);
      expect(typeof args[0]).toBe('string');
      // Script must use compare-and-delete (return 0 if token mismatch)
      expect(script).toContain("redis.call('get', KEYS[1])");
      expect(script).toContain('ARGV[1]');
      expect(script).toContain("redis.call('del'");
    });

    it('should release lock even if performSLACheck throws', async () => {
      redisService.setNx.mockResolvedValueOnce(true);
      ticketRepository.findMany.mockRejectedValueOnce(new Error('DB down'));

      await service.checkSLA();

      expect(redisService.eval).toHaveBeenCalledTimes(1);
    });

    it('should process tickets in batches of 500 with keyset pagination', async () => {
      redisService.setNx.mockResolvedValueOnce(true);
      redisService.eval.mockResolvedValueOnce(1);
      // First batch returns 500 items, second returns empty
      const batch1 = Array.from({ length: 500 }, (_, i) => makeTicket({ id: `t-${i}`, slaDueAt: new Date(Date.now() + 60 * 60 * 1000) }));
      ticketRepository.findMany
        .mockResolvedValueOnce(batch1)
        .mockResolvedValueOnce([]);

      await service.checkSLA();

      // First call: no id cursor yet
      expect(ticketRepository.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ take: 500, where: { status: { notIn: ['Resolved', 'Closed'] } } }),
      );
      // Second call: id > 't-499' cursor
      expect(ticketRepository.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          take: 500,
          where: { id: { gt: 't-499' }, status: { notIn: ['Resolved', 'Closed'] } },
        }),
      );
    });

    it('should mark ticket as OnTrack when remaining > 20% of window', async () => {
      redisService.setNx.mockResolvedValueOnce(true);
      redisService.eval.mockResolvedValueOnce(1);
      // Start as AtRisk so transition to OnTrack fires
      const ticket = makeTicket({ slaStatus: 'AtRisk', slaDueAt: new Date(Date.now() + 36 * 60 * 1000) });
      ticketRepository.findMany.mockResolvedValueOnce([ticket]).mockResolvedValueOnce([]);

      await service.checkSLA();

      expect(ticketRepository.updateMany).toHaveBeenCalledWith(
        { id: { in: ['t-1'] } },
        { slaStatus: 'OnTrack' },
      );
    });

    it('should mark ticket as AtRisk when remaining <= 20% of window', async () => {
      redisService.setNx.mockResolvedValueOnce(true);
      redisService.eval.mockResolvedValueOnce(1);
      // 10% of 60min remaining = 6min in future
      const ticket = makeTicket({ slaDueAt: new Date(Date.now() + 6 * 60 * 1000) });
      ticketRepository.findMany.mockResolvedValueOnce([ticket]).mockResolvedValueOnce([]);

      await service.checkSLA();

      expect(ticketRepository.updateMany).toHaveBeenCalledWith(
        { id: { in: ['t-1'] } },
        { slaStatus: 'AtRisk' },
      );
    });

    it('should mark ticket as Breached when slaDueAt is in the past', async () => {
      redisService.setNx.mockResolvedValueOnce(true);
      redisService.eval.mockResolvedValueOnce(1);
      // SLA already breached
      const ticket = makeTicket({ slaDueAt: new Date(Date.now() - 60 * 1000) });
      ticketRepository.findMany.mockResolvedValueOnce([ticket]).mockResolvedValueOnce([]);

      await service.checkSLA();

      expect(ticketRepository.updateMany).toHaveBeenCalledWith(
        { id: { in: ['t-1'] } },
        { slaStatus: 'Breached' },
      );
    });

    it('should skip ticket if no matching SLA config in category', async () => {
      redisService.setNx.mockResolvedValueOnce(true);
      redisService.eval.mockResolvedValueOnce(1);
      const ticket = makeTicket({
        category: { slaConfigs: [{ priority: Priority.Low, isActive: true, resolutionTimeMinutes: 60 }] },
      });
      ticketRepository.findMany.mockResolvedValueOnce([ticket]).mockResolvedValueOnce([]);

      await service.checkSLA();

      expect(ticketRepository.updateMany).not.toHaveBeenCalled();
    });

    it('should skip updateMany if status has not changed (no-op)', async () => {
      redisService.setNx.mockResolvedValueOnce(true);
      redisService.eval.mockResolvedValueOnce(1);
      // Ticket already OnTrack, 60% remaining -> still OnTrack
      const ticket = makeTicket({ slaStatus: 'OnTrack', slaDueAt: new Date(Date.now() + 36 * 60 * 1000) });
      ticketRepository.findMany.mockResolvedValueOnce([ticket]).mockResolvedValueOnce([]);

      await service.checkSLA();

      expect(ticketRepository.updateMany).not.toHaveBeenCalled();
    });

    it('should only query open/in-progress tickets (skip Resolved/Closed)', async () => {
      redisService.setNx.mockResolvedValueOnce(true);
      redisService.eval.mockResolvedValueOnce(1);
      ticketRepository.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.checkSLA();

      expect(ticketRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { notIn: ['Resolved', 'Closed'] },
          }),
        }),
      );
    });
  });
});
