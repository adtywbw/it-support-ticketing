import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
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
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolvedPath, file.buffer);
  }

  async delete(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  getReadStream(filePath: string): NodeJS.ReadableStream {
    return fs.createReadStream(filePath);
  }
}
