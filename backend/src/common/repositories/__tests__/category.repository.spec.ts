import { Test, TestingModule } from '@nestjs/testing';
import { CategoryRepository } from '../category.repository';
import { SubCategoryRepository } from '../sub-category.repository';
import { PrismaService } from '../../../prisma/prisma.service';

describe('CategoryRepository', () => {
  let repository: CategoryRepository;
  let prisma: any;

  const mockPrisma = {
    category: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repository = module.get<CategoryRepository>(CategoryRepository);
    prisma = module.get(PrismaService);
    jest.resetAllMocks();
  });

  describe('findAll (Admin — full shape)', () => {
    it('should include subCategories, slaConfigs, expanded _count, ordered by name asc', async () => {
      prisma.category.findMany.mockResolvedValueOnce([]);

      await repository.findAll(true);

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
          include: expect.objectContaining({
            subCategories: expect.objectContaining({ where: undefined }),
            slaConfigs: undefined,
            _count: { select: { tickets: true, subCategories: true, slaConfigs: true } },
          }),
        }),
      );
    });
  });

  describe('findAll (non-Admin — active only)', () => {
    it('should filter subCategories to active, include active slaConfigs, ordered by name asc', async () => {
      prisma.category.findMany.mockResolvedValueOnce([]);

      await repository.findAll(false);

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
          include: expect.objectContaining({
            subCategories: expect.objectContaining({ where: { isActive: true } }),
            slaConfigs: expect.objectContaining({ where: { isActive: true } }),
            _count: { select: { tickets: true, subCategories: true, slaConfigs: true } },
          }),
        }),
      );
    });
  });

  describe('findAllForTicketForm (EndUser/ITSupport — minimal shape)', () => {
    it('should filter to isActive=true and use select instead of include for sub-categories', async () => {
      prisma.category.findMany.mockResolvedValueOnce([]);

      await repository.findAllForTicketForm();

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: expect.objectContaining({
            id: true,
            name: true,
            description: true,
            isActive: true,
            subCategories: expect.objectContaining({
              where: { isActive: true },
              select: expect.any(Object),
            }),
          }),
        }),
      );
      const args = prisma.category.findMany.mock.calls[0][0];
      expect(args).not.toHaveProperty('include');
    });
  });

  describe('findByIdForTicketForm', () => {
    it('should use findFirst with where id+isActive (not findUnique)', async () => {
      prisma.category.findFirst.mockResolvedValueOnce({ id: 'c1' });

      await repository.findByIdForTicketForm('c1');

      expect(prisma.category.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c1', isActive: true } }),
      );
    });
  });

  describe('findById', () => {
    it('should use default include (subCategories + slaConfigs + _count) when no include arg', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'c1' });

      await repository.findById('c1');

      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 'c1' },
        include: expect.objectContaining({
          subCategories: expect.any(Object),
          slaConfigs: true,
          _count: expect.any(Object),
        }),
      });
    });

    it('should use custom include when provided', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'c1' });

      await repository.findById('c1', { tickets: true });

      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 'c1' },
        include: { tickets: true },
      });
    });
  });

  describe('findByName', () => {
    it('should query by unique name (used for create-time conflict check)', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'c1', isActive: true });

      await repository.findByName('Network');

      expect(prisma.category.findUnique).toHaveBeenCalledWith({ where: { name: 'Network' } });
    });
  });

  describe('create', () => {
    it('should pass through create data + include', async () => {
      prisma.category.create.mockResolvedValueOnce({ id: 'c1' });

      await repository.create({ name: 'Network', description: 'd' } as any, { subCategories: true });

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'Network' }),
        include: { subCategories: true },
      });
    });
  });

  describe('update', () => {
    it('should pass through id, data, include', async () => {
      prisma.category.update.mockResolvedValueOnce({ id: 'c1' });

      await repository.update('c1', { description: 'd' } as any, { subCategories: true });

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { description: 'd' },
        include: { subCategories: true },
      });
    });
  });

  describe('delete', () => {
    it('should hard-delete by id', async () => {
      prisma.category.delete.mockResolvedValueOnce({ id: 'c1' });

      await repository.delete('c1');

      expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });
  });
});

describe('SubCategoryRepository', () => {
  let repository: SubCategoryRepository;
  let prisma: any;

  const mockPrisma = {
    subCategory: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubCategoryRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repository = module.get<SubCategoryRepository>(SubCategoryRepository);
    prisma = module.get(PrismaService);
    jest.resetAllMocks();
  });

  describe('findByCategoryId', () => {
    it('should filter to isActive=true and include ticket count when includeInactive is false', async () => {
      prisma.subCategory.findMany.mockResolvedValueOnce([]);

      await repository.findByCategoryId('c1', false);

      expect(prisma.subCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { categoryId: 'c1', isActive: true },
          orderBy: { name: 'asc' },
          include: { _count: { select: { tickets: true, faqs: true } } },
        }),
      );
    });

    it('should not filter by isActive when includeInactive is true', async () => {
      prisma.subCategory.findMany.mockResolvedValueOnce([]);

      await repository.findByCategoryId('c1', true);

      expect(prisma.subCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { categoryId: 'c1' },
          orderBy: { name: 'asc' },
          include: { _count: { select: { tickets: true, faqs: true } } },
        }),
      );
    });

    it('should default to isActive=true when includeInactive is not provided', async () => {
      prisma.subCategory.findMany.mockResolvedValueOnce([]);

      await repository.findByCategoryId('c1');

      expect(prisma.subCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { categoryId: 'c1', isActive: true },
          orderBy: { name: 'asc' },
          include: { _count: { select: { tickets: true, faqs: true } } },
        }),
      );
    });
  });

  describe('findByCategoryAndName (used for create-time conflict check)', () => {
    it('should query composite unique key (categoryId, name)', async () => {
      prisma.subCategory.findUnique.mockResolvedValueOnce({ id: 's1' });

      await repository.findByCategoryAndName('c1', 'VPN');

      expect(prisma.subCategory.findUnique).toHaveBeenCalledWith({
        where: { categoryId_name: { categoryId: 'c1', name: 'VPN' } },
      });
    });
  });

  describe('create', () => {
    it('should pass through create data', async () => {
      prisma.subCategory.create.mockResolvedValueOnce({ id: 's1' });

      await repository.create({ name: 'VPN', category: { connect: { id: 'c1' } } } as any);

      expect(prisma.subCategory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'VPN' }),
      });
    });
  });

  describe('findById', () => {
    it('should query by id with optional include', async () => {
      prisma.subCategory.findUnique.mockResolvedValueOnce({ id: 's1' });

      await repository.findById('s1', { tickets: true });

      expect(prisma.subCategory.findUnique).toHaveBeenCalledWith({
        where: { id: 's1' },
        include: { tickets: true },
      });
    });
  });

  describe('update', () => {
    it('should update by id with provided data', async () => {
      prisma.subCategory.update.mockResolvedValueOnce({ id: 's1' });

      await repository.update('s1', { isActive: false });

      expect(prisma.subCategory.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { isActive: false },
      });
    });
  });

  describe('delete', () => {
    it('should hard-delete by id', async () => {
      prisma.subCategory.delete.mockResolvedValueOnce({ id: 's1' });

      await repository.delete('s1');

      expect(prisma.subCategory.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    });
  });
});
