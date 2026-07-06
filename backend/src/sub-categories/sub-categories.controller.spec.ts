import { Test, TestingModule } from '@nestjs/testing';
import { SubCategoriesController } from './sub-categories.controller';
import { SubCategoriesService } from './sub-categories.service';

describe('SubCategoriesController', () => {
  let controller: SubCategoriesController;
  let service: any;

  const mockService = {
    findByCategoryId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubCategoriesController],
      providers: [{ provide: SubCategoriesService, useValue: mockService }],
    }).compile();
    controller = module.get<SubCategoriesController>(SubCategoriesController);
    service = module.get(SubCategoriesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('findByCategoryId calls service', async () => {
    mockService.findByCategoryId.mockResolvedValue([{ id: 'sub-1' }]);
    const result = await controller.findByCategoryId('cat-1');
    expect(service.findByCategoryId).toHaveBeenCalledWith('cat-1');
    expect(result).toEqual([{ id: 'sub-1' }]);
  });

  it('create merges categoryId and calls service', async () => {
    const dto = { name: 'New', description: 'Desc' };
    mockService.create.mockResolvedValue({ id: 'sub-1', ...dto, categoryId: 'cat-1' });
    const result = await controller.create('cat-1', dto as any);
    expect(service.create).toHaveBeenCalledWith({ ...dto, categoryId: 'cat-1' });
    expect(result).toEqual({ id: 'sub-1', name: 'New', description: 'Desc', categoryId: 'cat-1' });
  });

  it('update calls service with id and DTO', async () => {
    mockService.update.mockResolvedValue({ id: 'sub-1', name: 'Updated' });
    const result = await controller.update('sub-1', { name: 'Updated' } as any);
    expect(service.update).toHaveBeenCalledWith('sub-1', { name: 'Updated' });
    expect(result).toEqual({ id: 'sub-1', name: 'Updated' });
  });

  it('delete calls service and returns message', async () => {
    mockService.delete.mockResolvedValue(undefined);
    const result = await controller.delete('sub-1');
    expect(service.delete).toHaveBeenCalledWith('sub-1');
    expect(result).toEqual({ message: 'Sub-category deleted successfully' });
  });
});
