import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Role, AttachmentVisibility, Prisma } from '@prisma/client';
import { Express } from 'express';
import { readdir, unlink } from 'fs/promises';
import * as path from 'path';
import { AttachmentRepository } from '../common/repositories/attachment.repository';
import { TicketRepository } from '../common/repositories/ticket.repository';
import { StorageService, STORAGE_SERVICE } from './interfaces/storage-service.interface';
import { AttachmentVisibilityPolicy, UserRole } from '../common/policies/attachment-visibility.policy';
import { buildSafeUploadPath, sanitizeOriginalName } from '../common/utils/upload.util';
import { ALLOWED_MIME_TYPES, assertMimeTypeIntegrity } from '../common/utils/mime-validation.util';
import { buildPaginationMeta } from '../common/utils/pagination.util';
import { appConfig } from '../common/config/app.config';

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

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly attachmentRepository: AttachmentRepository,
    private readonly ticketRepository: TicketRepository,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageService,
  ) {}

  /**
   * Periodic cleanup of orphaned files in the uploads directory.
   * Removes files that exist on disk but have no corresponding DB record.
   * Runs every 6 hours.
   */
  @Cron('0 */6 * * *')
  async cleanupOrphanedFiles() {
    const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

    try {
      const storedPaths = await this.attachmentRepository.findAllPaths();
      const storedFilenames = new Set(storedPaths.map((p) => path.basename(p.path)));

      const entries = await readdir(uploadDir, { withFileTypes: true });
      let removedCount = 0;

      for (const entry of entries) {
        if (!entry.isFile()) continue;

        // Skip known temporary directories used by maintenance restore
        // (they have different naming patterns and are managed separately)
        if (entry.name.startsWith('.')) continue;

        if (!storedFilenames.has(entry.name)) {
          const fullPath = path.join(uploadDir, entry.name);
          try {
            await unlink(fullPath);
            removedCount++;
          } catch (err) {
            this.logger.warn(`Failed to remove orphaned file ${entry.name}: ${(err as Error).message}`);
          }
        }
      }

      if (removedCount > 0) {
        this.logger.log(`Cleanup complete: removed ${removedCount} orphaned file(s) from ${uploadDir}`);
      }
    } catch (err) {
      this.logger.error(`Orphaned file cleanup failed: ${(err as Error).message}`);
    }
  }

  async upload(ticketId: string, file: Express.Multer.File, userId: string, userRole: string, visibility?: AttachmentVisibility) {
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

    if (file.size > appConfig.fileUpload.maxDirectFileSize) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const filePath = buildSafeUploadPath(uploadDir, file.originalname);

    const resolvedVisibility: AttachmentVisibility = userRole === Role.EndUser
      ? AttachmentVisibility.PUBLIC
      : (visibility === AttachmentVisibility.INTERNAL ? AttachmentVisibility.INTERNAL : AttachmentVisibility.PUBLIC);

    try {
      return await this.attachmentRepository.transaction(async (tx) => {
        const attachmentCount = await tx.attachment.count({ where: { ticketId } });
        if (attachmentCount >= appConfig.fileUpload.maxFilesPerTicket) {
          throw new BadRequestException(
            `Maximum ${appConfig.fileUpload.maxFilesPerTicket} attachments per ticket`,
          );
        }

        // Save file inside transaction — if save fails, transaction rolls back.
        // If transaction fails after save, the catch block below cleans up.
        await this.storageService.save(file, filePath);

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
      // Best-effort cleanup of any file saved inside the transaction
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

    return { data: attachments, meta: buildPaginationMeta(total, actualLimit, normalizedPage) };
  }

  async getDownloadInfo(id: string, userId: string, userRole: string) {
    const attachment = await this.attachmentRepository.findUnique({
      where: { id },
      include: {
        ticket: { select: { requesterId: true } },
        comment: { select: { type: true } },
      },
    }) as Prisma.AttachmentGetPayload<{
      include: {
        ticket: { select: { requesterId: true } };
        comment: { select: { type: true } };
      };
    }> | null;

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
