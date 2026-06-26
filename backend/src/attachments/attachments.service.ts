import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CommentType, Role, AttachmentVisibility } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { Express } from 'express';
import { AttachmentRepository } from '../common/repositories/attachment.repository';
import { TicketRepository } from '../common/repositories/ticket.repository';
import { StorageService } from './interfaces/storage-service.interface';
import { AttachmentVisibilityPolicy, UserRole } from '../common/policies/attachment-visibility.policy';

const ALLOWED_MIME_TYPES = [
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

const ATTACHMENT_SAFE_SELECT = {
  id: true,
  ticketId: true,
  commentId: true,
  userId: true,
  originalName: true,
  mimeType: true,
  size: true,
  visibility: true,
  createdAt: true,
};

const MIME_SIGNATURES: Array<{ mime: string; bytes: number[]; offset: number }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], offset: 0 },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38], offset: 0 },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 },
  { mime: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04], offset: 0 },
  { mime: 'application/x-rar-compressed', bytes: [0x52, 0x61, 0x72, 0x21], offset: 0 },
];

function detectMimeFromMagicBytes(buffer: Buffer): string | null {
  for (const sig of MIME_SIGNATURES) {
    if (buffer.length >= sig.offset + sig.bytes.length) {
      const match = sig.bytes.every((b, i) => buffer[sig.offset + i] === b);
      if (match) return sig.mime;
    }
  }
  return null;
}

function assertMimeTypeIntegrity(file: Express.Multer.File): void {
  const detected = detectMimeFromMagicBytes(file.buffer);
  if (detected && detected !== file.mimetype) {
    throw new BadRequestException(
      `File content does not match declared type ${file.mimetype}`,
    );
  }
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES_PER_TICKET = 5;

function buildSafeUploadPath(uploadDir: string, originalName: string): string {
  const uploadRoot = path.resolve(uploadDir);
  const ext = path.extname(path.basename(originalName)) || '';
  const safeName = `${uuidv4()}${ext}`;
  const resolvedPath = path.resolve(path.join(uploadRoot, safeName));
  if (!resolvedPath.startsWith(uploadRoot + path.sep) && resolvedPath !== uploadRoot) {
    throw new BadRequestException('Invalid file path');
  }
  return resolvedPath;
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly attachmentRepository: AttachmentRepository,
    private readonly ticketRepository: TicketRepository,
    @Inject('StorageService')
    private readonly storageService: StorageService,
  ) {}

  async upload(ticketId: string, file: Express.Multer.File, userId: string, userRole: string, visibility?: string) {
    const ticket = await this.ticketRepository.findUnique({
      where: { id: ticketId },
      select: { id: true, requesterId: true },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (userRole === Role.EndUser && ticket.requesterId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const attachmentCount = await this.attachmentRepository.count({
      ticketId,
    });

    if (attachmentCount >= MAX_FILES_PER_TICKET) {
      throw new BadRequestException(
        `Maximum ${MAX_FILES_PER_TICKET} attachments per ticket`,
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} is not allowed`,
      );
    }

    if (file.buffer) {
      assertMimeTypeIntegrity(file);
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const filePath = buildSafeUploadPath(uploadDir, file.originalname);

    await this.storageService.save(file, filePath);

    const resolvedVisibility = userRole === Role.EndUser
      ? AttachmentVisibility.PUBLIC
      : (visibility === 'INTERNAL' ? AttachmentVisibility.INTERNAL : AttachmentVisibility.PUBLIC);

    const attachment = await this.attachmentRepository.create(
      {
        ticket: { connect: { id: ticketId } },
        user: { connect: { id: userId } },
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: filePath,
        visibility: resolvedVisibility,
      },
      {
        user: { select: { id: true, name: true } },
      },
    );

    return attachment;
  }

  async findByTicketId(ticketId: string, userId: string, userRole: string) {
    const ticket = await this.ticketRepository.findUnique({
      where: { id: ticketId },
      select: { id: true, requesterId: true },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (userRole === Role.EndUser && ticket.requesterId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const attachments = await this.attachmentRepository.findByTicketId(ticketId, {
      select: {
        ...ATTACHMENT_SAFE_SELECT,
        user: { select: { id: true, name: true } },
        comment: { select: { type: true } },
      },
    });

    if (userRole === Role.EndUser) {
      return attachments.filter((attachment: any) =>
        AttachmentVisibilityPolicy.isAttachmentVisible(attachment, userRole as UserRole),
      );
    }

    return attachments;
  }

  async getDownloadInfo(id: string, userId: string, userRole: string) {
    const attachment = await this.attachmentRepository.findById(id, {
      ticket: { select: { requesterId: true } },
      comment: { select: { type: true } },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    if (userRole === Role.EndUser && attachment.ticket.requesterId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (userRole === Role.EndUser && !AttachmentVisibilityPolicy.isAttachmentVisible(attachment, userRole as UserRole)) {
      throw new ForbiddenException('Access denied');
    }

    return attachment;
  }
}
