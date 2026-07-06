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
const childProcess = require('child_process') as jest.Mocked<typeof import('child_process')>;

describe('MaintenanceService restore safety', () => {
  let service: MaintenanceService;

  beforeEach(() => {
    service = new MaintenanceService({} as any);
    jest.spyOn(service as any, 'getBackup').mockResolvedValue({
      id: '20260627-120000000',
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
      id: '20260627-115900000',
      createdAt: '2026-06-27T11:59:00.000Z',
      files: {
        db: { exists: true, size: 1 },
        uploads: { exists: true, size: 1 },
      },
    });
    jest.spyOn(service as any, 'restoreDatabase').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'restoreUploads').mockRejectedValue(new Error('uploads failed'));
    const loggerError = jest.spyOn((service as any).logger, 'error');

    await expect(service.restoreBackup('20260627-120000000', '20260627-120000000')).rejects.toThrow(
      /Pre-restore backup: 20260627-115900000/,
    );

    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('Restore failed for backup 20260627-120000000: uploads failed'),
      expect.any(String),
    );
    expect(service.setMaintenanceMode).toHaveBeenLastCalledWith(
      true,
      'Restore failed. System held in maintenance. Use pre-restore backup for recovery.',
    );
  });

  it('does not run destructive restore when pre-restore backup fails', async () => {
    jest.spyOn(service as any, 'createBackup').mockRejectedValue(new Error('pre backup failed'));
    const restoreDatabase = jest.spyOn(service as any, 'restoreDatabase').mockResolvedValue(undefined);
    const restoreUploads = jest.spyOn(service as any, 'restoreUploads').mockResolvedValue(undefined);

    await expect(service.restoreBackup('20260627-120000000', '20260627-120000000')).rejects.toThrow(BadRequestException);

    expect(restoreDatabase).not.toHaveBeenCalled();
    expect(restoreUploads).not.toHaveBeenCalled();
    expect(service.setMaintenanceMode).toHaveBeenLastCalledWith(
      true,
      'Restore failed. System held in maintenance. Use pre-restore backup for recovery.',
    );
  });

  it('releases restore lock before disabling maintenance after successful restore', async () => {
    jest.spyOn(service as any, 'createBackup').mockResolvedValue({
      id: '20260627-115900000',
      createdAt: '2026-06-27T11:59:00.000Z',
      files: {
        db: { exists: true, size: 1 },
        uploads: { exists: true, size: 1 },
      },
    });
    jest.spyOn(service as any, 'restoreDatabase').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'restoreUploads').mockResolvedValue(undefined);

    await service.restoreBackup('20260627-120000000', '20260627-120000000');

    const disableMaintenanceCall = (service.setMaintenanceMode as jest.Mock).mock.calls.findIndex(
      (call: [boolean, string?]) => call[0] === false,
    );
    const disableMaintenanceOrder = (service.setMaintenanceMode as jest.Mock).mock.invocationCallOrder[disableMaintenanceCall];
    const releaseLockOrder = ((service as any).releaseLock as jest.Mock).mock.invocationCallOrder[0];

    expect(disableMaintenanceCall).toBeGreaterThanOrEqual(0);
    expect((service as any).releaseLock).toHaveBeenCalledTimes(1);
    expect(releaseLockOrder).toBeLessThan(disableMaintenanceOrder);
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

describe('MaintenanceService restoreDatabase pg_trgm support', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://ticketing:secret@db:5432/ticketing?schema=public';
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    jest.restoreAllMocks();
  });

  it('restores schema backups with pg_trgm extension before trigram indexes are created', async () => {
    const service: any = new MaintenanceService({} as any);

    await service.restoreDatabase('/app/backups/20260702-014500/db.sql.gz');

    const restoreCall = (childProcess.execFile as unknown as jest.Mock).mock.calls.find(
      (call: any[]) => call[0] === 'bash' && call[1]?.[0] === '-c',
    );

    expect(restoreCall).toBeDefined();
    expect(restoreCall![1][1]).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;');
    expect(restoreCall![1][1]).toContain('CREATE SCHEMA IF NOT EXISTS public;');
  });
});

describe('MaintenanceService lock renewal', () => {
  let redis: { eval: jest.Mock };
  let service: any;

  beforeEach(() => {
    jest.useFakeTimers();
    redis = { eval: jest.fn().mockResolvedValue(1) };
    service = new MaintenanceService(redis as any) as any;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('renews a lock only when the stored token matches', async () => {
    redis.eval.mockResolvedValueOnce(1);

    const renewed = await service.renewLock({ key: 'maintenance:backup:lock', token: 'abc' }, 600);

    expect(renewed).toBe(true);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('expire'),
      ['maintenance:backup:lock'],
      ['abc', '600'],
    );
  });

  it('returns false when lock renewal token does not match', async () => {
    redis.eval.mockResolvedValueOnce(0);

    const renewed = await service.renewLock({ key: 'maintenance:backup:lock', token: 'abc' }, 600);

    expect(renewed).toBe(false);
  });

  it('stops renewal timer in finally cleanup', () => {
    const timer = service.startLockRenewal({ key: 'maintenance:backup:lock', token: 'abc' }, 600);

    service.stopLockRenewal(timer);
    jest.advanceTimersByTime(300_000);

    expect(redis.eval).not.toHaveBeenCalled();
  });
});

describe('MaintenanceService createBackup lock renewal cleanup', () => {
  let service: any;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://ticketing:secret@db:5432/ticketing?schema=public';
    const redis = { get: jest.fn().mockResolvedValue(null) };
    service = new MaintenanceService(redis as any) as any;
    jest.spyOn(service, 'getMaintenanceMode').mockResolvedValue({ enabled: true, message: null });
    jest.spyOn(service, 'acquireLock').mockResolvedValue({ key: 'maintenance:backup:lock', token: 'abc' });
    jest.spyOn(service, 'releaseLock').mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
    jest.restoreAllMocks();
  });

  it('stops renewal timer and releases lock when createUniqueBackupId throws', async () => {
    jest.spyOn(service, 'createUniqueBackupId').mockRejectedValue(new Error('id collision'));
    const stopLockRenewal = jest.spyOn(service, 'stopLockRenewal');
    const startLockRenewal = jest.spyOn(service, 'startLockRenewal');

    await expect(service.createBackup('admin-ui')).rejects.toThrow(BadRequestException);

    expect(startLockRenewal).toHaveBeenCalledTimes(1);
    expect(stopLockRenewal).toHaveBeenCalledTimes(1);
    expect(stopLockRenewal).toHaveBeenCalledWith(startLockRenewal.mock.results[0].value);
    expect(service.releaseLock).toHaveBeenCalledWith({ key: 'maintenance:backup:lock', token: 'abc' });
  });
});
