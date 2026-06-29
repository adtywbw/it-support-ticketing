import { BadRequestException } from '@nestjs/common';
import {
  detectMimeFromMagicBytes,
  assertMimeTypeIntegrity,
} from '../mime-validation.util';

function makeFile(buffer: Buffer, mimetype: string) {
  return { buffer, mimetype } as any;
}

describe('MIME validation', () => {
  describe('detectMimeFromMagicBytes', () => {
    it('should detect JPEG', () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(detectMimeFromMagicBytes(buffer)).toBe('image/jpeg');
    });

    it('should detect PNG', () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      expect(detectMimeFromMagicBytes(buffer)).toBe('image/png');
    });

    it('should detect PDF', () => {
      const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
      expect(detectMimeFromMagicBytes(buffer)).toBe('application/pdf');
    });

    it('should detect ZIP', () => {
      const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
      expect(detectMimeFromMagicBytes(buffer)).toBe('application/zip');
    });

    it('should detect OLE2 CFB (legacy Office)', () => {
      const buffer = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
      expect(detectMimeFromMagicBytes(buffer)).toBe('application/msword');
    });

    it('should return null for unknown signature', () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      expect(detectMimeFromMagicBytes(buffer)).toBeNull();
    });
  });

  describe('assertMimeTypeIntegrity — Office file compatibility', () => {
    const zipSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
    const oleSignature = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);

    const OOXML_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const OOXML_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    it('should accept .docx (OOXML) detected as application/zip', () => {
      expect(() => assertMimeTypeIntegrity(makeFile(zipSignature, OOXML_DOCX))).not.toThrow();
    });

    it('should accept .xlsx (OOXML) detected as application/zip', () => {
      expect(() => assertMimeTypeIntegrity(makeFile(zipSignature, OOXML_XLSX))).not.toThrow();
    });

    it('should accept .doc (legacy) detected as application/msword', () => {
      expect(() => assertMimeTypeIntegrity(makeFile(oleSignature, 'application/msword'))).not.toThrow();
    });

    it('should accept .xls (legacy) detected as application/msword via compatibility map', () => {
      expect(() => assertMimeTypeIntegrity(makeFile(oleSignature, 'application/vnd.ms-excel'))).not.toThrow();
    });

    it('should accept .zip detected as application/zip', () => {
      expect(() => assertMimeTypeIntegrity(makeFile(zipSignature, 'application/zip'))).not.toThrow();
    });
  });

  describe('assertMimeTypeIntegrity — spoofing rejection', () => {
    const zipSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);

    it('should reject image/png declared but ZIP content', () => {
      expect(() => assertMimeTypeIntegrity(makeFile(zipSignature, 'image/png'))).toThrow(BadRequestException);
    });

    it('should reject application/pdf declared but ZIP content', () => {
      expect(() => assertMimeTypeIntegrity(makeFile(zipSignature, 'application/pdf'))).toThrow(BadRequestException);
    });

    it('should reject image/jpeg declared but PNG content', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      expect(() => assertMimeTypeIntegrity(makeFile(pngBuffer, 'image/jpeg'))).toThrow(BadRequestException);
    });
  });

  describe('assertMimeTypeIntegrity — text files', () => {
    it('should accept valid text/plain without null bytes', () => {
      const buffer = Buffer.from('Hello, world!', 'utf-8');
      expect(() => assertMimeTypeIntegrity(makeFile(buffer, 'text/plain'))).not.toThrow();
    });

    it('should reject text/plain with null bytes', () => {
      const buffer = Buffer.from('Hello\x00world', 'utf-8');
      expect(() => assertMimeTypeIntegrity(makeFile(buffer, 'text/plain'))).toThrow(BadRequestException);
    });

    it('should accept valid text/csv without null bytes', () => {
      const buffer = Buffer.from('a,b,c\n1,2,3', 'utf-8');
      expect(() => assertMimeTypeIntegrity(makeFile(buffer, 'text/csv'))).not.toThrow();
    });
  });

  describe('assertMimeTypeIntegrity — unknown signatures', () => {
    it('should pass when no signature detected and mimetype is allowed', () => {
      const buffer = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      expect(() => assertMimeTypeIntegrity(makeFile(buffer, 'text/plain'))).not.toThrow();
    });
  });
});
