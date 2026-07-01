import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CategoriesService } from '../categories.service';
import { CategoryRepository } from '../../common/repositories/category.repository';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let categoryRepository: any;

  const mockCategoryRepository = {
    findAll: jest.fn(),
    findAllForTicketForm: jest.fn(),
    findById: jest.fn(),
    findByIdForTicketForm: jest.fn(),
    findByName: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: CategoryRepository, useValue: mockCategoryRepository },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    categoryRepository = module.get(CategoryRepository);
    jest.resetAllMocks();
  });

  describe('findAll', () => {
    it('should return full data for Admin', async () => {
      const full = [{ id: 'c1', name: 'Network', _count: {}, slaConfigs: [] }];
      categoryRepository.findAll.mockResolvedValueOnce(full);

      const result = await service.findAll(Role.Admin);

      expect(result).toEqual(full);
      expect(categoryRepository.findAll).toHaveBeenCalledTimes(1);
      expect(categoryRepository.findAllForTicketForm).not.toHaveBeenCalled();
    });

    it('should return ticket-form shape for ITSupport (no _count/slaConfigs)', async () => {
      const minimal = [{ id: 'c1', name: 'Network' }];
      categoryRepository.findAllForTicketForm.mockResolvedValueOnce(minimal);

      const result = await service.findAll(Role.ITSupport);

      expect(result).toEqual(minimal);
      expect(categoryRepository.findAllForTicketForm).toHaveBeenCalledTimes(1);
      expect(categoryRepository.findAll).not.toHaveBeenCalled();
    });

    it('should return ticket-form shape for EndUser', async () => {
      const minimal = [{ id: 'c1', name: 'Network' }];
      categoryRepository.findAllForTicketForm.mockResolvedValueOnce(minimal);

      const result = await service.findAll(Role.EndUser);

      expect(result).toEqual(minimal);
    });
  });

  describe('findById', () => {
    it('should return full data for Admin', async () => {
      const full = { id: 'c1', name: 'Network', _count: {} };
      categoryRepository.findById.mockResolvedValueOnce(full);

      const result = await service.findById('c1', Role.Admin);

      expect(result).toEqual(full);
      expect(categoryRepository.findById).toHaveBeenCalledWith('c1');
    });

    it('should return ticket-form shape for ITSupport', async () => {
      const minimal = { id: 'c1', name: 'Network' };
      categoryRepository.findByIdForTicketForm.mockResolvedValueOnce(minimal);

      const result = await service.findById('c1', Role.ITSupport);

      expect(result).toEqual(minimal);
      expect(categoryRepository.findByIdForTicketForm).toHaveBeenCalledWith('c1');
    });

    it('should throw NotFoundException when category does not exist', async () => {
      categoryRepository.findById.mockResolvedValueOnce(null);

      await expect(service.findById('missing', Role.Admin)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create new category when name is unique', async () => {
      categoryRepository.findByName.mockResolvedValueOnce(null);
      categoryRepository.create.mockResolvedValueOnce({ id: 'c1', name: 'Network' });

      const result = await service.create({ name: 'Network', description: 'desc' });

      expect(result).toEqual({ id: 'c1', name: 'Network' });
      expect(categoryRepository.create).toHaveBeenCalledWith(
        { name: 'Network', description: 'desc' },
        { subCategories: true },
      );
    });

    it('should throw ConflictException when name already exists and is active', async () => {
      categoryRepository.findByName.mockResolvedValueOnce({ id: 'c1', name: 'Network', isActive: true });

      await expect(service.create({ name: 'Network' })).rejects.toThrow(ConflictException);
      expect(categoryRepository.create).not.toHaveBeenCalled();
    });

    it('should reactivate (resurrect) inactive category with same name (intentional behavior)', async () => {
      categoryRepository.findByName.mockResolvedValueOnce({ id: 'c1', name: 'Network', isActive: false, description: 'old' });
      categoryRepository.update.mockResolvedValueOnce({ id: 'c1', name: 'Network', isActive: true, description: 'new' });

      const result = await service.create({ name: 'Network', description: 'new' });

      expect(result.description).toBe('new');
      expect(categoryRepository.update).toHaveBeenCalledWith(
        'c1',
        { isActive: true, description: 'new' },
        { subCategories: true },
      );
    });
  });

  describe('update', () => {
    it('should throw NotFoundException when category does not exist', async () => {
      categoryRepository.findById.mockResolvedValueOnce(null);

      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when name conflicts with another category', async () => {
      categoryRepository.findById.mockResolvedValueOnce({ id: 'c1', name: 'Network' });
      categoryRepository.findByName.mockResolvedValueOnce({ id: 'c2', name: 'Network', isActive: true });

      await expect(service.update('c1', { name: 'Network' })).rejects.toThrow(ConflictException);
    });

    it('should allow updating with the same name (no conflict with self)', async () => {
      categoryRepository.findById.mockResolvedValueOnce({ id: 'c1', name: 'Network' });
      categoryRepository.findByName.mockResolvedValueOnce({ id: 'c1', name: 'Network' });
      categoryRepository.update.mockResolvedValueOnce({ id: 'c1', name: 'Network' });

      await expect(service.update('c1', { name: 'Network' })).resolves.toEqual({ id: 'c1', name: 'Network' });
    });
  });

  describe('delete', () => {
    it('should hard-delete when no relations exist', async () => {
      categoryRepository.findById.mockResolvedValueOnce({
        id: 'c1', name: 'Network',
        _count: { tickets: 0, subCategories: 0, slaConfigs: 0 },
      });

      await service.delete('c1');

      expect(categoryRepository.delete).toHaveBeenCalledWith('c1');
      expect(categoryRepository.update).not.toHaveBeenCalled();
    });

    it('should soft-delete (isActive=false) when tickets exist', async () => {
      categoryRepository.findById.mockResolvedValueOnce({
        id: 'c1', name: 'Network',
        _count: { tickets: 5, subCategories: 0, slaConfigs: 0 },
      });

      await service.delete('c1');

      expect(categoryRepository.update).toHaveBeenCalledWith('c1', { isActive: false });
      expect(categoryRepository.delete).not.toHaveBeenCalled();
    });

    it('should soft-delete when sub-categories exist', async () => {
      categoryRepository.findById.mockResolvedValueOnce({
        id: 'c1', name: 'Network',
        _count: { tickets: 0, subCategories: 2, slaConfigs: 0 },
      });

      await service.delete('c1');

      expect(categoryRepository.update).toHaveBeenCalledWith('c1', { isActive: false });
    });

    it('should soft-delete when SLA configs exist', async () => {
      categoryRepository.findById.mockResolvedValueOnce({
        id: 'c1', name: 'Network',
        _count: { tickets: 0, subCategories: 0, slaConfigs: 1 },
      });

      await service.delete('c1');

      expect(categoryRepository.update).toHaveBeenCalledWith('c1', { isActive: false });
    });

    it('should throw NotFoundException when category does not exist', async () => {
      categoryRepository.findById.mockResolvedValueOnce(null);

      await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
