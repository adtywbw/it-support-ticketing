import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BadRequestException } from '@nestjs/common';

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.pdf',
  '.zip',
  '.rar',
  '.txt',
  '.csv',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
]);

export function buildSafeUploadPath(uploadDir: string, originalName: string): string {
  const uploadRoot = path.resolve(uploadDir);
  const rawExt = path.extname(path.basename(originalName)).toLowerCase();
  const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : '';
  const safeName = `${uuidv4()}${ext}`;
  const resolvedPath = path.resolve(path.join(uploadRoot, safeName));
  if (!resolvedPath.startsWith(uploadRoot + path.sep) && resolvedPath !== uploadRoot) {
    throw new BadRequestException('Invalid file path');
  }
  return resolvedPath;
}

export function sanitizeOriginalName(name: string): string {
  const basename = path.basename(name);
  return basename.substring(0, 255);
}
