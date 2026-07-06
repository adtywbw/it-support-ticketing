import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from '../categories.controller';
import { CategoriesService } from '../categories.service';
import { Role } from '@prisma/client';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let categoriesService: any;

  const mockCategoriesService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        { provide: CategoriesService, useValue: mockCategoriesService },
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
    categoriesService = module.get(CategoriesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll()', () => {
    it('should call categoriesService.findAll with user role', async () => {
      const mockResult = [{ id: 'cat-1', name: 'Hardware' }];
      mockCategoriesService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll({ role: Role.Admin });

      expect(categoriesService.findAll).toHaveBeenCalledWith(Role.Admin);
      expect(result).toEqual(mockResult);
    });
  });

  describe('findById()', () => {
    it('should call categoriesService.findById with id and role', async () => {
      mockCategoriesService.findById.mockResolvedValue({ id: 'cat-1', name: 'Hardware' });

      const result = await controller.findById('cat-1', { role: Role.ITSupport });

      expect(categoriesService.findById).toHaveBeenCalledWith('cat-1', Role.ITSupport);
      expect(result).toEqual({ id: 'cat-1', name: 'Hardware' });
    });
  });

  describe('create()', () => {
    it('should call categoriesService.create with DTO', async () => {
      const dto = { name: 'New Category', description: 'Test' };
      mockCategoriesService.create.mockResolvedValue({ id: 'cat-new', ...dto });

      const result = await controller.create(dto as any);

      expect(categoriesService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ id: 'cat-new', name: 'New Category', description: 'Test' });
    });
  });

  describe('update()', () => {
    it('should call categoriesService.update with id and DTO', async () => {
      const dto = { name: 'Updated' };
      mockCategoriesService.update.mockResolvedValue({ id: 'cat-1', name: 'Updated' });

      const result = await controller.update('cat-1', dto as any);

      expect(categoriesService.update).toHaveBeenCalledWith('cat-1', dto);
      expect(result).toEqual({ id: 'cat-1', name: 'Updated' });
    });
  });

  describe('delete()', () => {
    it('should call categoriesService.delete and return success message', async () => {
      mockCategoriesService.delete.mockResolvedValue(undefined);

      const result = await controller.delete('cat-1');

      expect(categoriesService.delete).toHaveBeenCalledWith('cat-1');
      expect(result).toEqual({ message: 'Category deleted successfully' });
    });
  });
});
