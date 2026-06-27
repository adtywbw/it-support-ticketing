import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CommentType, Role, AttachmentVisibility, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { Express } from 'express';
import { AttachmentRepository } from '../common/repositories/attachment.repository';
import { TicketRepository } from '../common/repositories/ticket.repository';
import { StorageService } from './interfaces/storage-service.interface';
import { AttachmentVisibilityPolicy, UserRole } from '../common/policies/attachment-visibility.policy';
import { buildSafeUploadPath, sanitizeOriginalName } from '../common/utils/upload.util';

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
  { mime: 'application/msword', bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], offset: 0 },
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

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES_PER_TICKET = 5;

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

    const resolvedVisibility = userRole === Role.EndUser
      ? AttachmentVisibility.PUBLIC
      : (visibility === 'INTERNAL' ? AttachmentVisibility.INTERNAL : AttachmentVisibility.PUBLIC);

    await this.storageService.save(file, filePath);

    try {
      return await this.attachmentRepository.transaction(async (tx) => {
        const attachmentCount = await tx.attachment.count({ where: { ticketId } });
        if (attachmentCount >= MAX_FILES_PER_TICKET) {
          throw new BadRequestException(
            `Maximum ${MAX_FILES_PER_TICKET} attachments per ticket`,
          );
        }

        return tx.attachment.create({
          data: {
            ticket: { connect: { id: ticketId } },
            user: { connect: { id: userId } },
            originalName: sanitizeOriginalName(file.originalname),
            mimeType: file.mimetype,
            size: file.size,
            path: filePath,
            visibility: resolvedVisibility,
          },
          include: {
            user: { select: { id: true, name: true } },
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      await this.storageService.delete(filePath).catch(() => {});
      throw error;
    }
  }

  async findByTicketId(ticketId: string, userId: string, userRole: string, page = 1, limit = 20) {
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

    const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
    const actualLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
    const skip = (normalizedPage - 1) * actualLimit;

    const visibleWhere = AttachmentVisibilityPolicy.buildVisibleAttachmentWhere(userRole as UserRole);
    const attachmentWhere = visibleWhere ? { ticketId, ...visibleWhere } : { ticketId };
    const [attachments, total] = await Promise.all([
      this.attachmentRepository.findByTicketId(ticketId, {
        where: attachmentWhere,
        select: {
          ...ATTACHMENT_SAFE_SELECT,
          user: { select: { id: true, name: true } },
          comment: { select: { type: true } },
        },
        skip,
        take: actualLimit,
      }),
      this.attachmentRepository.count(attachmentWhere),
    ]);

    const totalPages = Math.ceil(total / actualLimit) || 1;
    return { data: attachments, meta: { page: normalizedPage, limit: actualLimit, total, totalPages } };
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
