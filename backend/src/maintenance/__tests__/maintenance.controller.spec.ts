import { Test, TestingModule } from '@nestjs/testing';
import { MaintenanceController } from '../maintenance.controller';
import { MaintenanceService } from '../maintenance.service';


describe('MaintenanceController', () => {
  let controller: MaintenanceController;
  let service: any;

  const mockService = {
    getMaintenanceMode: jest.fn(),
    setMaintenanceMode: jest.fn(),
    listBackups: jest.fn(),
    createBackup: jest.fn(),
    deleteBackup: jest.fn(),
    restoreBackup: jest.fn(),
    getBackupFilePath: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaintenanceController],
      providers: [{ provide: MaintenanceService, useValue: mockService }],
    }).compile();
    controller = module.get<MaintenanceController>(MaintenanceController);
    service = module.get(MaintenanceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('getMaintenanceMode returns mode', async () => {
    mockService.getMaintenanceMode.mockResolvedValue({ enabled: false });
    expect(await controller.getMaintenanceMode()).toEqual({ enabled: false });
  });

  it('setMaintenanceMode updates and returns mode', async () => {
    mockService.setMaintenanceMode.mockResolvedValue(undefined);
    mockService.getMaintenanceMode.mockResolvedValue({ enabled: true, message: 'Down' });
    const result = await controller.setMaintenanceMode({ enabled: true, message: 'Down' } as any);
    expect(service.setMaintenanceMode).toHaveBeenCalledWith(true, 'Down');
    expect(result).toEqual({ enabled: true, message: 'Down' });
  });

  it('listBackups calls service', async () => {
    mockService.listBackups.mockResolvedValue([]);
    expect(await controller.listBackups()).toEqual([]);
  });

  it('createBackup calls service', async () => {
    mockService.createBackup.mockResolvedValue({ id: 'bk-1' });
    expect(await controller.createBackup()).toEqual({ id: 'bk-1' });
  });

  it('deleteBackup calls service and returns message', async () => {
    mockService.deleteBackup.mockResolvedValue(undefined);
    const result = await controller.deleteBackup('bk-1');
    expect(service.deleteBackup).toHaveBeenCalledWith('bk-1');
    expect(result).toEqual({ message: 'Backup deleted successfully' });
  });

  it('restoreBackup calls service and returns result', async () => {
    mockService.restoreBackup.mockResolvedValue({ id: 'pre-bk' });
    const result = await controller.restoreBackup('bk-1', { confirmation: 'RESTORE' } as any);
    expect(service.restoreBackup).toHaveBeenCalledWith('bk-1', 'RESTORE');
    expect(result).toEqual({ message: 'Backup restored successfully. Please log in again.', preRestoreBackup: { id: 'pre-bk' } });
  });

  it('downloadDatabaseBackup calls service and uses res.download', async () => {
    const mockRes = { download: jest.fn() } as any;
    mockService.getBackupFilePath.mockResolvedValue('/backups/20260706-120000/db.sql.gz');
    await controller.downloadDatabaseBackup('20260706-120000', mockRes);
    expect(service.getBackupFilePath).toHaveBeenCalledWith('20260706-120000', 'db');
    expect(mockRes.download).toHaveBeenCalledWith('/backups/20260706-120000/db.sql.gz', '20260706-120000-db.sql.gz');
  });
});
