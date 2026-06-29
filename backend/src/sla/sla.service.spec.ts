import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SLAService } from './sla.service';
import { SlaConfigRepository } from '../common/repositories/sla-config.repository';
import { TicketRepository } from '../common/repositories/ticket.repository';
import { CategoryRepository } from '../common/repositories/category.repository';
import { RedisService } from '../redis/redis.service';
import { Priority } from '@prisma/client';

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
  };

  const mockRedisService = {
    setNx: jest.fn(),
    del: jest.fn(),
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

    jest.clearAllMocks();
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
    });

    it('should allow patching isActive without time validation', async () => {
      slaConfigRepository.findUnique.mockResolvedValue(existingConfig);
      slaConfigRepository.update.mockResolvedValue({ ...existingConfig, isActive: false });

      const result = await service.update('config-1', { isActive: false });

      expect(result.isActive).toBe(false);
      expect(slaConfigRepository.update).toHaveBeenCalledWith('config-1', { isActive: false });
    });

    it('should allow equal response and resolution times', async () => {
      slaConfigRepository.findUnique.mockResolvedValue(existingConfig);
      slaConfigRepository.update.mockResolvedValue({ ...existingConfig, responseTimeMinutes: 120, resolutionTimeMinutes: 120 });

      const result = await service.update('config-1', { responseTimeMinutes: 120, resolutionTimeMinutes: 120 });

      expect(result.responseTimeMinutes).toBe(120);
      expect(result.resolutionTimeMinutes).toBe(120);
    });
  });
});
