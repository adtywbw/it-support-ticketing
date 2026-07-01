import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import { RedisService } from '../redis/redis.service';

const execFileAsync = promisify(execFile);
const BACKUP_ID_PATTERN = /^\d{8}-\d{6}$/;
const MAINTENANCE_KEY = 'maintenance:enabled';
const MAINTENANCE_MESSAGE_KEY = 'maintenance:message';
const DRAIN_TIME_MS = 5000;
const BACKUP_LOCK_KEY = 'maintenance:backup:lock';
const RESTORE_LOCK_KEY = 'maintenance:restore:lock';
const BACKUP_LOCK_TTL = 600;
const EXEC_MAX_BUFFER = 16 * 1024 * 1024;

export interface BackupFileInfo {
  exists: boolean;
  size: number;
}

export interface BackupInfo {
  id: string;
  createdAt: string;
  files: {
    db: BackupFileInfo;
    uploads: BackupFileInfo;
  };
}

interface LockHandle {
  key: string;
  token: string;
}

interface PgOptions {
  env: NodeJS.ProcessEnv;
  schema: string;
}

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);
  private readonly backupDir = process.env.BACKUP_DIR || '/app/backups';
  private readonly uploadDir = process.env.UPLOAD_DIR || '/app/uploads';

  constructor(private readonly redis: RedisService) {}

  private async acquireLock(key: string, ttl: number): Promise<LockHandle | null> {
    const token = crypto.randomBytes(16).toString('hex');
    const acquired = await this.redis.getClient().set(key, token, 'EX', ttl, 'NX');
    if (!acquired) return null;
    return { key, token };
  }

  private static readonly RELEASE_LOCK_SCRIPT = `
    if redis.call('get', KEYS[1]) == ARGV[1] then
      return redis.call('del', KEYS[1])
    else
      return 0
    end
  `;

  private async releaseLock(handle: LockHandle): Promise<void> {
    await this.redis.eval(
      MaintenanceService.RELEASE_LOCK_SCRIPT,
      [handle.key],
      [handle.token],
    );
  }

  async setMaintenanceMode(enabled: boolean, message?: string): Promise<void> {
    if (!enabled) {
      const restoreLock = await this.redis.get(RESTORE_LOCK_KEY);
      if (restoreLock) {
        throw new BadRequestException('Cannot disable maintenance during active restore');
      }
    }
    await this.redis.set(MAINTENANCE_KEY, enabled ? '1' : '0');
    if (message !== undefined && message.trim() !== '') {
      await this.redis.set(MAINTENANCE_MESSAGE_KEY, message);
    } else if (enabled) {
      await this.redis.set(MAINTENANCE_MESSAGE_KEY, 'System sedang dalam pemeliharaan. Silakan coba lagi beberapa saat.');
    } else {
      await this.redis.del(MAINTENANCE_MESSAGE_KEY);
    }
  }

  async getMaintenanceMode(): Promise<{ enabled: boolean; message: string | null }> {
    const [enabled, message] = await this.redis.mget([MAINTENANCE_KEY, MAINTENANCE_MESSAGE_KEY]);
    return {
      enabled: enabled === '1',
      message: message || null,
    };
  }

  async createBackup(source = 'admin-ui'): Promise<BackupInfo> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new BadRequestException('DATABASE_URL is not configured');
    }

    if (source !== 'pre-restore') {
      const { enabled } = await this.getMaintenanceMode();
      if (!enabled) {
        throw new BadRequestException('Maintenance mode must be enabled before creating a backup');
      }

      // Reject if a restore is mid-flight; otherwise pg_dump could run against
      // a half-dropped schema (the restore does DROP SCHEMA + psql import).
      const restoreLock = await this.redis.get(RESTORE_LOCK_KEY);
      if (restoreLock) {
        throw new BadRequestException('Cannot create backup during an active restore');
      }
    }

    const lock = await this.acquireLock(BACKUP_LOCK_KEY, BACKUP_LOCK_TTL);
    if (!lock) {
      throw new BadRequestException('A backup operation is already in progress');
    }

    const id = await this.createUniqueBackupId();
    const backupPath = this.resolveBackupPath(id);
    const dbSqlPath = path.join(backupPath, 'db.sql');
    const uploadsPath = path.join(backupPath, 'uploads.tar.gz');
    const manifestPath = path.join(backupPath, 'manifest.txt');

    try {
      await fs.mkdir(backupPath, { recursive: true, mode: 0o700 });
      const pgDump = this.createPgDumpOptions(databaseUrl, dbSqlPath);

      await execFileAsync('pg_dump', pgDump.args, {
        env: { ...process.env, ...pgDump.env },
        maxBuffer: EXEC_MAX_BUFFER,
      });
      await execFileAsync('gzip', ['-f', dbSqlPath], {
        maxBuffer: EXEC_MAX_BUFFER,
      });
      await fs.chmod(dbSqlPath.replace(/\.sql$/, '.sql.gz'), 0o600);

      await execFileAsync('tar', ['-czf', uploadsPath, '-C', this.uploadDir, '.'], {
        maxBuffer: EXEC_MAX_BUFFER,
      });
      await fs.chmod(uploadsPath, 0o600);

      await fs.writeFile(
        manifestPath,
        [
          `created_at=${id}`,
          `source=${source}`,
          'files=db.sql.gz uploads.tar.gz',
          '',
        ].join('\n'),
      );
      await fs.chmod(manifestPath, 0o600);
    } catch (error) {
      this.logger.error(`Backup failed: ${(error as Error).message}`, (error as Error).stack);
      await fs.rm(backupPath, { recursive: true, force: true });
      throw new BadRequestException('Backup failed. See server logs for details.');
    } finally {
      await this.releaseLock(lock).catch(() => {});
    }

    return this.getBackup(id);
  }

  async listBackups(): Promise<BackupInfo[]> {
    await fs.mkdir(this.backupDir, { recursive: true });
    const entries = await fs.readdir(this.backupDir, { withFileTypes: true });
    const ids = entries
      .filter((entry) => entry.isDirectory() && BACKUP_ID_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();

    const recentIds = ids.slice(0, 50);
    const results: BackupInfo[] = [];
    const queue = [...recentIds];
    const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
      while (queue.length > 0) {
        const id = queue.shift()!;
        results.push(await this.getBackup(id));
      }
    });
    await Promise.allSettled(workers);
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getBackup(id: string): Promise<BackupInfo> {
    this.assertValidBackupId(id);
    const backupPath = this.resolveBackupPath(id);

    try {
      const stat = await fs.stat(backupPath);
      if (!stat.isDirectory()) {
        throw new NotFoundException('Backup not found');
      }
    } catch {
      throw new NotFoundException('Backup not found');
    }

    return {
      id,
      createdAt: this.backupIdToIso(id),
      files: {
        db: await this.getFileInfo(path.join(backupPath, 'db.sql.gz')),
        uploads: await this.getFileInfo(path.join(backupPath, 'uploads.tar.gz')),
      },
    };
  }

  async getBackupFilePath(id: string, file: 'db' | 'uploads'): Promise<string> {
    await this.getBackup(id);
    const fileName = file === 'db' ? 'db.sql.gz' : 'uploads.tar.gz';
    const filePath = path.join(this.resolveBackupPath(id), fileName);
    const info = await this.getFileInfo(filePath);
    if (!info.exists) {
      throw new NotFoundException('Backup file not found');
    }
    return filePath;
  }

  async deleteBackup(id: string): Promise<void> {
    await this.getBackup(id);

    try {
      await fs.rm(this.resolveBackupPath(id), { recursive: true, force: true });
    } catch {
      throw new BadRequestException('Failed to delete backup. See server logs for details.');
    }
  }

  async restoreBackup(id: string, confirmation: string): Promise<BackupInfo> {
    if (confirmation !== id) {
      throw new BadRequestException('Backup confirmation does not match');
    }

    const backup = await this.getBackup(id);
    if (!backup.files.db.exists || !backup.files.uploads.exists) {
      throw new BadRequestException('Backup is missing database or uploads file');
    }

    const backupPath = this.resolveBackupPath(id);
    const dbPath = path.join(backupPath, 'db.sql.gz');
    const uploadsPath = path.join(backupPath, 'uploads.tar.gz');

    await this.validateGzipFile(dbPath, 'Database backup is invalid');
    await this.validateGzipFile(uploadsPath, 'Uploads backup is invalid');

    const lock = await this.acquireLock(RESTORE_LOCK_KEY, 1800);
    if (!lock) {
      throw new BadRequestException('A restore operation is already in progress');
    }

    let preRestoreBackup: BackupInfo | null = null;

    try {
      await this.setMaintenanceMode(true, 'Sedang restore data. Silakan tunggu beberapa saat...');
      await new Promise((resolve) => setTimeout(resolve, DRAIN_TIME_MS));

      preRestoreBackup = await this.createBackup('pre-restore');
      await this.restoreDatabase(dbPath);
      await this.restoreUploads(uploadsPath);

      await this.setMaintenanceMode(false);
      return preRestoreBackup;
    } catch (error) {
      this.logger.error(
        `Restore failed for backup ${id}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      const message = 'Restore gagal. Sistem ditahan dalam maintenance. Gunakan pre-restore backup untuk recovery.';
      await this.setMaintenanceMode(true, message).catch(() => {});
      const preRestoreDetail = preRestoreBackup ? ` Pre-restore backup: ${preRestoreBackup.id}.` : '';
      throw new BadRequestException(
        `${message}${preRestoreDetail} See server logs for details.`,
      );
    } finally {
      await this.releaseLock(lock).catch(() => {});
    }
  }

  private async getFileInfo(filePath: string): Promise<BackupFileInfo> {
    try {
      const stat = await fs.stat(filePath);
      return { exists: stat.isFile(), size: stat.size };
    } catch {
      return { exists: false, size: 0 };
    }
  }

  private createBackupId(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      '-',
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join('');
  }

  private async createUniqueBackupId(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = this.createBackupId();
      try {
        await fs.access(this.resolveBackupPath(id));
      } catch {
        return id;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new BadRequestException('Unable to create unique backup id');
  }

  private async validateGzipFile(filePath: string, message: string): Promise<void> {
    try {
      await execFileAsync('gzip', ['-t', filePath], { maxBuffer: 1024 * 1024 });
    } catch {
      throw new BadRequestException(message);
    }
  }

  private async restoreDatabase(dbPath: string): Promise<void> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new BadRequestException('DATABASE_URL is not configured');
    }

    const pg = this.createPgOptions(databaseUrl);
    await execFileAsync(
      'psql',
      [
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `DROP SCHEMA IF EXISTS ${this.quoteIdentifier(pg.schema)} CASCADE;`,
      ],
      { env: { ...process.env, ...pg.env }, maxBuffer: 1024 * 1024 },
    );

    await execFileAsync(
      'sh',
      ['-c', 'gzip -dc "$DB_BACKUP_PATH" | psql -v ON_ERROR_STOP=1'],
      {
        env: { ...process.env, ...pg.env, DB_BACKUP_PATH: dbPath },
        maxBuffer: EXEC_MAX_BUFFER,
      },
    );
  }

  private async restoreUploads(uploadsPath: string): Promise<void> {
    await this.assertSafeTarArchive(uploadsPath);

    const tempDirName = `.upload-restore-${crypto.randomBytes(8).toString('hex')}`;
    const tempDir = path.join(this.uploadDir, tempDirName);

    try {
      await fs.mkdir(tempDir, { recursive: true });
      await execFileAsync('tar', ['-xzf', uploadsPath, '-C', tempDir, '--no-same-owner', '--no-same-permissions'], {
        maxBuffer: EXEC_MAX_BUFFER,
      });

      await fs.mkdir(this.uploadDir, { recursive: true });
      const entries = await fs.readdir(this.uploadDir);
      await Promise.all(
        entries
          .filter((entry) => entry !== tempDirName)
          .map((entry) => fs.rm(path.join(this.uploadDir, entry), {
            recursive: true,
            force: true,
          })),
      );

      const extractedEntries = await fs.readdir(tempDir);
      for (const entry of extractedEntries) {
        await fs.rename(path.join(tempDir, entry), path.join(this.uploadDir, entry));
      }
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async assertSafeTarArchive(uploadsPath: string): Promise<void> {
    let output: string;
    try {
      const result = await execFileAsync('tar', ['-tzvf', uploadsPath], {
        maxBuffer: EXEC_MAX_BUFFER,
      });
      output = result.stdout;
    } catch {
      throw new BadRequestException('Uploads backup is invalid or unreadable.');
    }

    const lines = output.split('\n').filter((line) => line.length > 0);
    const uploadDirResolved = path.resolve(this.uploadDir);

    for (const line of lines) {
      const fileType = line.charAt(0);
      if (fileType === 'l' || fileType === 'L') {
        throw new BadRequestException('Uploads backup contains symlink or hardlink');
      }

      const entry = line.substring(line.indexOf('./') >= 0 ? line.indexOf('./') : line.lastIndexOf(' ') + 1);
      this.assertSafeTarEntry(entry, uploadDirResolved);
    }
  }

  private assertSafeTarEntry(entryName: string, uploadDirResolved: string): void {
    if (!entryName || entryName.includes('\0')) {
      throw new BadRequestException('Uploads backup contains unsafe path');
    }

    if (path.isAbsolute(entryName)) {
      throw new BadRequestException('Uploads backup contains absolute path');
    }

    const normalized = path.posix.normalize(entryName);
    if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
      throw new BadRequestException('Uploads backup contains path traversal');
    }

    const resolvedEntry = path.resolve(uploadDirResolved, entryName);
    if (!resolvedEntry.startsWith(uploadDirResolved + path.sep) && resolvedEntry !== uploadDirResolved) {
      throw new BadRequestException('Uploads backup contains path traversal');
    }
  }

  private createPgOptions(databaseUrl: string): PgOptions {
    const url = new URL(databaseUrl);
    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (!databaseName) {
      throw new BadRequestException('DATABASE_URL database name is not configured');
    }

    const env: NodeJS.ProcessEnv = {
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGDATABASE: databaseName,
    };
    if (url.username) env.PGUSER = decodeURIComponent(url.username);
    if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);

    const sslMode = url.searchParams.get('sslmode');
    if (sslMode) env.PGSSLMODE = sslMode;

    return { env, schema: url.searchParams.get('schema') || 'public' };
  }

  private quoteIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private createPgDumpOptions(
    databaseUrl: string,
    outputPath: string,
  ): { args: string[]; env: NodeJS.ProcessEnv } {
    const pg = this.createPgOptions(databaseUrl);

    const args = ['-f', outputPath];
    if (pg.schema) args.push('--schema', pg.schema);

    return { args, env: pg.env };
  }

  private backupIdToIso(id: string): string {
    const year = Number(id.slice(0, 4));
    const month = Number(id.slice(4, 6)) - 1;
    const day = Number(id.slice(6, 8));
    const hour = Number(id.slice(9, 11));
    const minute = Number(id.slice(11, 13));
    const second = Number(id.slice(13, 15));
    return new Date(year, month, day, hour, minute, second).toISOString();
  }

  private resolveBackupPath(id: string): string {
    this.assertValidBackupId(id);
    return path.join(this.backupDir, id);
  }

  private assertValidBackupId(id: string): void {
    if (!BACKUP_ID_PATTERN.test(id)) {
      throw new BadRequestException('Invalid backup id');
    }
  }
}
