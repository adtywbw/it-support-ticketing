import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { Express } from 'express';
import { StorageService } from '../interfaces/storage-service.interface';

@Injectable()
export class LocalStorageService implements StorageService {
  async save(file: Express.Multer.File, filePath: string): Promise<void> {
    const uploadRoot = path.resolve(process.env.UPLOAD_DIR || './uploads');
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(uploadRoot + path.sep) && resolvedPath !== uploadRoot) {
      throw new BadRequestException('File path outside upload directory');
    }

    const dir = path.dirname(resolvedPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(resolvedPath, file.buffer);
  }

  async delete(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  getReadStream(filePath: string): NodeJS.ReadableStream {
    return fsSync.createReadStream(filePath);
  }
}
