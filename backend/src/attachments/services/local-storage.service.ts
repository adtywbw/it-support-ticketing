import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Express } from 'express';
import { StorageService } from '../interfaces/storage-service.interface';

@Injectable()
export class LocalStorageService implements StorageService {
  async save(file: Express.Multer.File, filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, file.buffer);
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
