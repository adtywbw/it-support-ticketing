import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from '../dashboard.controller';
import { DashboardService } from '../dashboard.service';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: any;

  const mockService = {
    getStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: mockService }],
    }).compile();
    controller = module.get<DashboardController>(DashboardController);
    service = module.get(DashboardService);
  });

  afterEach(() => jest.clearAllMocks());

  it('getStats calls service with query and returns result', async () => {
    const result = { current: { activeTickets: 0 }, attention: {}, analytics: {} };
    mockService.getStats.mockResolvedValue(result);

    const output = await controller.getStats({ range: '30d' } as any);

    expect(service.getStats).toHaveBeenCalledWith({ range: '30d' });
    expect(output).toEqual(result);
  });

  it('getStats passes empty query when no params', async () => {
    mockService.getStats.mockResolvedValue({});
    await controller.getStats({} as any);
    expect(service.getStats).toHaveBeenCalledWith({});
  });
});
