import { Injectable, BadRequestException } from '@nestjs/common';
import { createReadStream } from 'fs';
import { mkdir, writeFile, unlink } from 'fs/promises';
import * as path from 'path';
import { Express } from 'express';
import { StorageService } from '../interfaces/storage-service.interface';

@Injectable()
export class LocalStorageService implements StorageService {
  async save(file: Express.Multer.File, filePath: string): Promise<void> {
    const uploadRoot = path.resolve(process.env.UPLOAD_DIR || './uploads');
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(uploadRoot + path.sep)) {
      throw new BadRequestException('File path outside upload directory');
    }

    const dir = path.dirname(resolvedPath);
    await mkdir(dir, { recursive: true });
    await writeFile(resolvedPath, file.buffer);
  }

  async delete(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  getReadStream(filePath: string): NodeJS.ReadableStream {
    return createReadStream(filePath);
  }
}
