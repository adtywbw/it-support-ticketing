import { Express } from 'express';

export interface StorageService {
  save(file: Express.Multer.File, path: string): Promise<void>;
  delete(path: string): Promise<void>;
  getReadStream(path: string): NodeJS.ReadableStream;
}
