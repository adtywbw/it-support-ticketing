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
import { ALLOWED_MIME_TYPES, assertMimeTypeIntegrity } from '../common/utils/mime-validation.util';

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
