import { Test, TestingModule } from '@nestjs/testing';
import { SlaConfigRepository } from '../sla-config.repository';
import { PrismaService } from '../../../prisma/prisma.service';

describe('SlaConfigRepository', () => {
  let repository: SlaConfigRepository;
  let prisma: any;

  const mockPrisma = {
    sLAConfig: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlaConfigRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repository = module.get<SlaConfigRepository>(SlaConfigRepository);
    prisma = module.get(PrismaService);
    jest.resetAllMocks();
  });

  describe('findUnique (used by SLA lookup with composite key)', () => {
    it('should support composite key (categoryId, priority) lookup', async () => {
      prisma.sLAConfig.findUnique.mockResolvedValueOnce({ id: 's1' });

      await repository.findUnique({ categoryId_priority: { categoryId: 'c1', priority: 'High' } } as any);

      expect(prisma.sLAConfig.findUnique).toHaveBeenCalledWith({
        where: { categoryId_priority: { categoryId: 'c1', priority: 'High' } },
      });
    });
  });

  describe('findFirst (used for priority-fallback in SLAService.getSLAConfig)', () => {
    it('should pass through Prisma findFirst args', async () => {
      prisma.sLAConfig.findFirst.mockResolvedValueOnce({ id: 's1' });

      await repository.findFirst({ where: { isActive: true }, orderBy: { resolutionTimeMinutes: 'asc' } } as any);

      expect(prisma.sLAConfig.findFirst).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { resolutionTimeMinutes: 'asc' },
      });
    });
  });

  describe('findAll', () => {
    it('should include category name and order by categoryId, priority', async () => {
      prisma.sLAConfig.findMany.mockResolvedValueOnce([]);

      await repository.findAll();

      expect(prisma.sLAConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { category: { select: { id: true, name: true } } },
          orderBy: [{ categoryId: 'asc' }, { priority: 'asc' }],
        }),
      );
    });
  });

  describe('create', () => {
    it('should pass through create data', async () => {
      prisma.sLAConfig.create.mockResolvedValueOnce({ id: 's1' });

      await repository.create({
        category: { connect: { id: 'c1' } },
        priority: 'High',
        responseTimeMinutes: 60,
        resolutionTimeMinutes: 240,
      } as any);

      expect(prisma.sLAConfig.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ priority: 'High', responseTimeMinutes: 60 }),
      });
    });
  });

  describe('update', () => {
    it('should update by id with provided data', async () => {
      prisma.sLAConfig.update.mockResolvedValueOnce({ id: 's1', isActive: false });

      await repository.update('s1', { isActive: false });

      expect(prisma.sLAConfig.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { isActive: false },
      });
    });
  });
});
