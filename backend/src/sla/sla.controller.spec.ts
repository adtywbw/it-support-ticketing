import { Test, TestingModule } from '@nestjs/testing';
import { SLAController } from './sla.controller';
import { SLAService } from './sla.service';

describe('SLAController', () => {
  let controller: SLAController;
  let service: any;

  const mockService = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SLAController],
      providers: [{ provide: SLAService, useValue: mockService }],
    }).compile();
    controller = module.get<SLAController>(SLAController);
    service = module.get(SLAService);
  });

  afterEach(() => jest.clearAllMocks());

  it('findAll calls service', async () => {
    mockService.findAll.mockResolvedValue([{ id: 'sla-1' }]);
    expect(await controller.findAll()).toEqual([{ id: 'sla-1' }]);
    expect(service.findAll).toHaveBeenCalled();
  });

  it('create calls service with DTO', async () => {
    const dto = { categoryId: 'cat-1', priority: 'High', resolutionTimeMinutes: 480 };
    mockService.create.mockResolvedValue({ id: 'sla-1', ...dto });
    const result = await controller.create(dto as any);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 'sla-1', categoryId: 'cat-1', priority: 'High', resolutionTimeMinutes: 480 });
  });

  it('update calls service with id and DTO', async () => {
    const dto = { resolutionTimeMinutes: 240 };
    mockService.update.mockResolvedValue({ id: 'sla-1', ...dto });
    const result = await controller.update('sla-1', dto as any);
    expect(service.update).toHaveBeenCalledWith('sla-1', dto);
    expect(result).toEqual({ id: 'sla-1', resolutionTimeMinutes: 240 });
  });
});
