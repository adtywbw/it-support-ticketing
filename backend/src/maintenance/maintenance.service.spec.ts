import { BadRequestException } from '@nestjs/common';
import * as path from 'path';
import { MaintenanceService } from './maintenance.service';

jest.mock('fs/promises', () => ({
  __esModule: true,
  mkdir: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  rm: jest.fn().mockResolvedValue(undefined),
  rename: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockRejectedValue(new Error('not found')),
  writeFile: jest.fn().mockResolvedValue(undefined),
  chmod: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockRejectedValue(new Error('not found')),
}));

jest.mock('child_process', () => ({
  execFile: jest.fn(((_cmd: string, _args: string[], _opts: any, cb: any) => {
    if (typeof _opts === 'function') { cb = _opts; }
    cb(null, '', '');
  }) as any),
}));

const fs = require('fs/promises') as jest.Mocked<typeof import('fs/promises')>;

describe('MaintenanceService restore safety', () => {
  let service: MaintenanceService;

  beforeEach(() => {
    service = new MaintenanceService({} as any);
    jest.spyOn(service as any, 'getBackup').mockResolvedValue({
      id: '20260627-120000',
      createdAt: '2026-06-27T12:00:00.000Z',
      files: {
        db: { exists: true, size: 1 },
        uploads: { exists: true, size: 1 },
      },
    });
    jest.spyOn(service as any, 'validateGzipFile').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'acquireLock').mockResolvedValue({ key: 'restore', token: 'token' });
    jest.spyOn(service as any, 'releaseLock').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'setMaintenanceMode').mockResolvedValue(undefined);
    jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
      callback();
      return {} as NodeJS.Timeout;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps maintenance enabled and returns pre-restore id when uploads restore fails', async () => {
    jest.spyOn(service as any, 'createBackup').mockResolvedValue({
      id: '20260627-115900',
      createdAt: '2026-06-27T11:59:00.000Z',
      files: {
        db: { exists: true, size: 1 },
        uploads: { exists: true, size: 1 },
      },
    });
    jest.spyOn(service as any, 'restoreDatabase').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'restoreUploads').mockRejectedValue(new Error('uploads failed'));
    const loggerError = jest.spyOn((service as any).logger, 'error');

    await expect(service.restoreBackup('20260627-120000', '20260627-120000')).rejects.toThrow(
      /Pre-restore backup: 20260627-115900/,
    );

    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('Restore failed for backup 20260627-120000: uploads failed'),
      expect.any(String),
    );
    expect(service.setMaintenanceMode).toHaveBeenLastCalledWith(
      true,
      'Restore gagal. Sistem ditahan dalam maintenance. Gunakan pre-restore backup untuk recovery.',
    );
  });

  it('does not run destructive restore when pre-restore backup fails', async () => {
    jest.spyOn(service as any, 'createBackup').mockRejectedValue(new Error('pre backup failed'));
    const restoreDatabase = jest.spyOn(service as any, 'restoreDatabase').mockResolvedValue(undefined);
    const restoreUploads = jest.spyOn(service as any, 'restoreUploads').mockResolvedValue(undefined);

    await expect(service.restoreBackup('20260627-120000', '20260627-120000')).rejects.toThrow(BadRequestException);

    expect(restoreDatabase).not.toHaveBeenCalled();
    expect(restoreUploads).not.toHaveBeenCalled();
    expect(service.setMaintenanceMode).toHaveBeenLastCalledWith(
      true,
      'Restore gagal. Sistem ditahan dalam maintenance. Gunakan pre-restore backup untuk recovery.',
    );
  });
});

describe('MaintenanceService restoreUploads tempDir placement', () => {
  const service: any = new MaintenanceService({} as any);
  const uploadDir = (service as any).uploadDir;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(service, 'assertSafeTarArchive').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates tempDir inside uploadDir to avoid EXDEV cross-device rename', async () => {
    await service.restoreUploads('/tmp/fake.tar.gz');

    const tempDirCall = (fs.mkdir as jest.Mock).mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].startsWith(path.join(uploadDir, '.upload-restore-')),
    );
    expect(tempDirCall).toBeDefined();
    expect(path.dirname(tempDirCall![0] as string)).toBe(uploadDir);
  });
});
