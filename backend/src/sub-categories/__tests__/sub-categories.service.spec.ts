import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SubCategoriesService } from '../sub-categories.service';
import { SubCategoryRepository } from '../../common/repositories/sub-category.repository';
import { CategoryRepository } from '../../common/repositories/category.repository';

describe('SubCategoriesService', () => {
  let service: SubCategoriesService;
  let subRepo: any;
  let catRepo: any;

  const mockSubRepo = {
    findByCategoryId: jest.fn(),
    findByCategoryAndName: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockCatRepo = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubCategoriesService,
        { provide: SubCategoryRepository, useValue: mockSubRepo },
        { provide: CategoryRepository, useValue: mockCatRepo },
      ],
    }).compile();
    service = module.get<SubCategoriesService>(SubCategoriesService);
    subRepo = module.get(SubCategoryRepository);
    catRepo = module.get(CategoryRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findByCategoryId', () => {
    it('returns sub-categories when category exists', async () => {
      catRepo.findById.mockResolvedValue({ id: 'cat-1' });
      subRepo.findByCategoryId.mockResolvedValue([{ id: 'sub-1' }]);
      expect(await service.findByCategoryId('cat-1')).toEqual([{ id: 'sub-1' }]);
    });

    it('throws when category not found', async () => {
      catRepo.findById.mockResolvedValue(null);
      await expect(service.findByCategoryId('cat-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a new sub-category', async () => {
      catRepo.findById.mockResolvedValue({ id: 'cat-1' });
      subRepo.findByCategoryAndName.mockResolvedValue(null);
      subRepo.create.mockResolvedValue({ id: 'sub-1', name: 'New', categoryId: 'cat-1' });

      const result = await service.create({ categoryId: 'cat-1', name: 'New' });
      expect(subRepo.create).toHaveBeenCalled();
      expect(result.id).toBe('sub-1');
    });

    it('reactivates inactive duplicate', async () => {
      catRepo.findById.mockResolvedValue({ id: 'cat-1' });
      subRepo.findByCategoryAndName.mockResolvedValue({ id: 'sub-1', isActive: false });
      subRepo.update.mockResolvedValue({ id: 'sub-1', isActive: true });

      const result = await service.create({ categoryId: 'cat-1', name: 'Existing' });
      expect(subRepo.update).toHaveBeenCalledWith('sub-1', expect.objectContaining({ isActive: true }));
      expect(result.isActive).toBe(true);
    });

    it('throws on active duplicate', async () => {
      catRepo.findById.mockResolvedValue({ id: 'cat-1' });
      subRepo.findByCategoryAndName.mockResolvedValue({ id: 'sub-1', isActive: true });
      await expect(service.create({ categoryId: 'cat-1', name: 'Existing' })).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('updates sub-category', async () => {
      subRepo.findUnique.mockResolvedValue({ id: 'sub-1', categoryId: 'cat-1', name: 'Old' });
      subRepo.findByCategoryAndName.mockResolvedValue(null);
      subRepo.update.mockResolvedValue({ id: 'sub-1', name: 'New' });

      const result = await service.update('sub-1', { name: 'New' });
      expect(result.name).toBe('New');
    });

    it('throws on duplicate name', async () => {
      subRepo.findUnique.mockResolvedValue({ id: 'sub-1', categoryId: 'cat-1', name: 'Old' });
      subRepo.findByCategoryAndName.mockResolvedValue({ id: 'sub-2', isActive: true });
      await expect(service.update('sub-1', { name: 'Existing' })).rejects.toThrow(ConflictException);
    });

    it('throws when not found', async () => {
      subRepo.findUnique.mockResolvedValue(null);
      await expect(service.update('sub-1', { name: 'New' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('soft-deletes when tickets exist', async () => {
      subRepo.findUnique.mockResolvedValue({ id: 'sub-1', _count: { tickets: 5 } });
      await service.delete('sub-1');
      expect(subRepo.update).toHaveBeenCalledWith('sub-1', { isActive: false });
    });

    it('hard-deletes when no tickets', async () => {
      subRepo.findUnique.mockResolvedValue({ id: 'sub-1', _count: { tickets: 0 } });
      await service.delete('sub-1');
      expect(subRepo.delete).toHaveBeenCalledWith('sub-1');
    });
  });
});
