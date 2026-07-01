import { Express } from 'express';

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface StorageService {
  save(file: Express.Multer.File, path: string): Promise<void>;
  delete(path: string): Promise<void>;
  getReadStream(path: string): NodeJS.ReadableStream;
}
