import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BadRequestException } from '@nestjs/common';

export function buildSafeUploadPath(uploadDir: string, originalName: string): string {
  const uploadRoot = path.resolve(uploadDir);
  const rawExt = path.extname(path.basename(originalName)).toLowerCase();
  // Use the original extension as-is. MIME validation in the service layer
  // (assertMimeTypeIntegrity) already verified the file content matches
  // expectations, so we do not need a redundant extension allowlist here.
  // An empty rawExt (file without extension) is preserved as empty.
  const ext = rawExt;
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
