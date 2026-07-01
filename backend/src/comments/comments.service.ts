import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { Express } from 'express';
import { Role, CommentType, AttachmentVisibility, Prisma } from '@prisma/client';
import { CommentRepository } from '../common/repositories/comment.repository';
import { AttachmentRepository } from '../common/repositories/attachment.repository';
import { TicketRepository } from '../common/repositories/ticket.repository';
import { StorageService, STORAGE_SERVICE } from '../attachments/interfaces/storage-service.interface';
import { AttachmentVisibilityPolicy } from '../common/policies/attachment-visibility.policy';
import { buildSafeUploadPath, sanitizeOriginalName } from '../common/utils/upload.util';
import { ALLOWED_MIME_TYPES, assertMimeTypeIntegrity } from '../common/utils/mime-validation.util';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES_PER_COMMENT = 3;
const MAX_FILES_PER_TICKET = 5;

@Injectable()
export class CommentsService {
  constructor(
    private readonly commentRepository: CommentRepository,
    private readonly attachmentRepository: AttachmentRepository,
    private readonly ticketRepository: TicketRepository,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageService,
  ) {}

  async create(
    ticketId: string,
    content: string,
    type: CommentType,
    files: Express.Multer.File[],
    userId: string,
    userRole: string,
  ) {
    const ticket = await this.ticketRepository.findUnique({
      where: { id: ticketId },
      select: { id: true, requesterId: true },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (type === CommentType.INTERNAL && userRole === Role.EndUser) {
      throw new ForbiddenException(
        'End users cannot create internal comments',
      );
    }

    if (userRole === Role.EndUser && ticket.requesterId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (files.length > MAX_FILES_PER_COMMENT) {
      throw new BadRequestException(
        `Maximum ${MAX_FILES_PER_COMMENT} files per comment`,
      );
    }

    const existingAttachmentCount = await this.attachmentRepository.count({ ticketId });
    if (existingAttachmentCount + files.length > MAX_FILES_PER_TICKET) {
      throw new BadRequestException(
        `Maximum ${MAX_FILES_PER_TICKET} attachments per ticket`,
      );
    }

    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        throw new BadRequestException(
          `File type ${file.mimetype} is not allowed`,
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        throw new BadRequestException(
          `File "${file.originalname}" exceeds 5MB limit`,
        );
      }

      if (file.buffer) {
        assertMimeTypeIntegrity(file);
      }
    }

    const createdFiles: { path: string }[] = [];

    try {
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      for (const file of files) {
        const filePath = buildSafeUploadPath(uploadDir, file.originalname);
        await this.storageService.save(file, filePath);
        createdFiles.push({ path: filePath });
      }

      return await this.commentRepository.transaction(async (tx) => {
        const comment = await tx.comment.create({
          data: {
            ticket: { connect: { id: ticketId } },
            user: { connect: { id: userId } },
            content,
            type,
          },
        });

        await Promise.all(files.map((file, index) => tx.attachment.create({
          data: {
            ticket: { connect: { id: ticketId } },
            comment: { connect: { id: comment.id } },
            user: { connect: { id: userId } },
            originalName: sanitizeOriginalName(file.originalname),
            mimeType: file.mimetype,
            size: file.size,
            path: createdFiles[index].path,
            visibility: type === CommentType.INTERNAL ? AttachmentVisibility.INTERNAL : AttachmentVisibility.PUBLIC,
          },
        })));

        return tx.comment.findUnique({
          where: { id: comment.id },
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true, avatarUrl: true },
            },
            attachments: {
              select: {
                id: true,
                ticketId: true,
                commentId: true,
                userId: true,
                originalName: true,
                mimeType: true,
                size: true,
                visibility: true,
                createdAt: true,
                user: { select: { id: true, name: true } },
              },
            },
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (err) {
      for (const f of createdFiles) {
        try {
          await this.storageService.delete(f.path);
        } catch { /* ignore cleanup errors */ }
      }
      throw err;
    }
  }

  async findByTicketId(ticketId: string, userRole: string, userId: string, page = 1, limit = 20) {
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

    const where: Record<string, unknown> = { ticketId };
    if (userRole === Role.EndUser) {
      where.type = CommentType.PUBLIC;
    }

    const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
    const actualLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
    const skip = (normalizedPage - 1) * actualLimit;

    const [comments, total] = await Promise.all([
      this.commentRepository.findByTicketId(ticketId, where, { skip, take: actualLimit }),
      this.commentRepository.countByTicketId(ticketId, where),
    ]);

    let result = comments;
    if (userRole === Role.EndUser) {
      result = comments.map((comment: any) => ({
        ...comment,
        attachments: (comment.attachments || []).filter((att: any) =>
          AttachmentVisibilityPolicy.isAttachmentVisible(
            {
              comment: { type: comment.type },
              visibility: att.visibility,
            },
            'EndUser',
          )
        ),
      }));
    }

    const totalPages = Math.ceil(total / actualLimit) || 1;
    return { data: result, meta: { page: normalizedPage, limit: actualLimit, total, totalPages } };
  }
}
