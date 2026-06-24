import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const BACKUP_ID_PATTERN = /^\d{8}-\d{6}$/;

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

@Injectable()
export class MaintenanceService {
  private readonly backupDir = process.env.BACKUP_DIR || '/app/backups';
  private readonly uploadDir = process.env.UPLOAD_DIR || '/app/uploads';

  async createBackup(): Promise<BackupInfo> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new BadRequestException('DATABASE_URL is not configured');
    }

    const id = this.createBackupId();
    const backupPath = this.resolveBackupPath(id);
    const dbSqlPath = path.join(backupPath, 'db.sql');
    const uploadsPath = path.join(backupPath, 'uploads.tar.gz');
    const manifestPath = path.join(backupPath, 'manifest.txt');

    try {
      await fs.mkdir(backupPath, { recursive: true });
      const pgDump = this.createPgDumpOptions(databaseUrl, dbSqlPath);

      await execFileAsync('pg_dump', pgDump.args, {
        env: { ...process.env, ...pgDump.env },
        maxBuffer: 1024 * 1024,
      });
      await execFileAsync('gzip', ['-f', dbSqlPath], {
        maxBuffer: 1024 * 1024,
      });

      await execFileAsync('tar', ['-czf', uploadsPath, '-C', this.uploadDir, '.'], {
        maxBuffer: 1024 * 1024,
      });

      await fs.writeFile(
        manifestPath,
        [
          `created_at=${id}`,
          'source=admin-ui',
          'files=db.sql.gz uploads.tar.gz',
          '',
        ].join('\n'),
      );
    } catch (error) {
      await fs.rm(backupPath, { recursive: true, force: true });
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Backup failed',
      );
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

    return Promise.all(ids.map((id) => this.getBackup(id)));
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
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Delete backup failed',
      );
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

  private createPgDumpOptions(
    databaseUrl: string,
    outputPath: string,
  ): { args: string[]; env: NodeJS.ProcessEnv } {
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

    const args = ['-f', outputPath];
    const schema = url.searchParams.get('schema');
    if (schema) args.push('--schema', schema);

    return { args, env };
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
