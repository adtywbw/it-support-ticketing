import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogsController } from '../audit-logs.controller';
import { AuditLogsService } from '../audit-logs.service';

describe('AuditLogsController', () => {
  let controller: AuditLogsController;
  let service: jest.Mocked<AuditLogsService>;

  beforeEach(async () => {
    const mockService = { findAll: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogsController],
      providers: [
        { provide: AuditLogsService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<AuditLogsController>(AuditLogsController);
    service = module.get(AuditLogsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate to service.findAll with query DTO', async () => {
    const query = { page: 1, limit: 10 } as any;
    const expected = { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } };
    service.findAll.mockResolvedValue(expected);

    const result = await controller.findAll(query);

    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(result).toBe(expected);
  });
});
