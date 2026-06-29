import { BadRequestException } from '@nestjs/common';
import { Express } from 'express';

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-rar-compressed',
];

const MIME_SIGNATURES: Array<{ mime: string; bytes: number[]; offset: number }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], offset: 0 },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38], offset: 0 },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 },
  { mime: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04], offset: 0 },
  { mime: 'application/x-rar-compressed', bytes: [0x52, 0x61, 0x72, 0x21], offset: 0 },
  { mime: 'application/msword', bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], offset: 0 },
];

/**
 * Maps a detected magic-byte MIME to declared MIME types that are compatible
 * with the same container/signature format.
 *
 * - OOXML files (.docx, .xlsx) are ZIP containers, so magic bytes detect them
 *   as `application/zip` even though the declared type is the OOXML MIME.
 * - OLE2 Compound File Binary (CFB) is shared by legacy .doc and .xls files,
 *   so magic bytes detect both as `application/msword`.
 */
const MIME_COMPATIBILITY_MAP: Record<string, string[]> = {
  'application/zip': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  'application/msword': [
    'application/vnd.ms-excel',
  ],
};

export function detectMimeFromMagicBytes(buffer: Buffer): string | null {
  for (const sig of MIME_SIGNATURES) {
    if (buffer.length >= sig.offset + sig.bytes.length) {
      const match = sig.bytes.every((b, i) => buffer[sig.offset + i] === b);
      if (match) return sig.mime;
    }
  }
  return null;
}

export function assertMimeTypeIntegrity(file: Express.Multer.File): void {
  const detected = detectMimeFromMagicBytes(file.buffer);
  if (detected && detected !== file.mimetype) {
    const compatible = MIME_COMPATIBILITY_MAP[detected];
    if (!compatible || !compatible.includes(file.mimetype)) {
      throw new BadRequestException(
        `File content does not match declared type ${file.mimetype}`,
      );
    }
  }
  if (file.mimetype === 'text/plain' || file.mimetype === 'text/csv') {
    for (let i = 0; i < Math.min(file.buffer.length, 1024); i++) {
      if (file.buffer[i] === 0) {
        throw new BadRequestException(
          `File content does not match declared type ${file.mimetype}`,
        );
      }
    }
  }
}
