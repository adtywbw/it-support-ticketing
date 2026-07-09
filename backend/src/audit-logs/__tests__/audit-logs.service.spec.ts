import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogsService } from '../audit-logs.service';
import { AuditLogRepository } from '../../common/repositories/audit-log.repository';

describe('AuditLogsService', () => {
  let service: AuditLogsService;
  let repo: jest.Mocked<AuditLogRepository>;

  beforeEach(async () => {
    const mockRepo = {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogsService,
        { provide: AuditLogRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<AuditLogsService>(AuditLogsService);
    repo = module.get(AuditLogRepository);
  });

  describe('findAll', () => {
    const sampleLogs = [
      { id: '1', action: 'CREATE', entity: 'ticket', entityId: 't1', userId: 'u1', createdAt: new Date() },
      { id: '2', action: 'UPDATE', entity: 'ticket', entityId: 't2', userId: 'u2', createdAt: new Date() },
    ];

    it('should return paginated results with default page/limit', async () => {
      repo.findMany.mockResolvedValue(sampleLogs as any);
      repo.count.mockResolvedValue(50);

      const result = await service.findAll({} as any);

      expect(repo.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 50,
      });
      expect(repo.count).toHaveBeenCalledWith({ where: {} });
      expect(result.data).toBe(sampleLogs);
      expect(result.meta).toEqual({ page: 1, limit: 50, total: 50, totalPages: 1 });
    });

    it('should use custom page and limit', async () => {
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(100);

      const result = await service.findAll({ page: 3, limit: 20 } as any);

      expect(repo.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 40,
        take: 20,
      });
      expect(result.meta).toEqual({ page: 3, limit: 20, total: 100, totalPages: 5 });
    });

    it('should filter by action, entity, and userId', async () => {
      repo.findMany.mockResolvedValue([sampleLogs[0]] as any);
      repo.count.mockResolvedValue(1);

      const result = await service.findAll({
        action: 'CREATE',
        entity: 'ticket',
        userId: 'u1',
      } as any);

      const expectedWhere = { action: 'CREATE', entity: 'ticket', userId: 'u1' };
      expect(repo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
      expect(result.data).toHaveLength(1);
    });

    it('should handle partial filters', async () => {
      repo.findMany.mockResolvedValue(sampleLogs as any);
      repo.count.mockResolvedValue(2);

      await service.findAll({ action: 'CREATE' } as any);

      expect(repo.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { action: 'CREATE' },
      }));
    });

    it('should compute totalPages correctly for zero total', async () => {
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      const result = await service.findAll({} as any);

      expect(result.meta.totalPages).toBe(1);
    });
  });
});
