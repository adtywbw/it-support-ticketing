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
import { Role, CommentType, AttachmentVisibility } from '@prisma/client';
import { CommentRepository } from '../common/repositories/comment.repository';
import { AttachmentRepository } from '../common/repositories/attachment.repository';
import { TicketRepository } from '../common/repositories/ticket.repository';
import { StorageService } from '../attachments/interfaces/storage-service.interface';
import { AttachmentVisibilityPolicy } from '../common/policies/attachment-visibility.policy';

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

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES_PER_COMMENT = 3;

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
export class CommentsService {
  constructor(
    private readonly commentRepository: CommentRepository,
    private readonly attachmentRepository: AttachmentRepository,
    private readonly ticketRepository: TicketRepository,
    @Inject('StorageService')
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
    }

    const createdFiles: { path: string }[] = [];

    try {
      const comment = await this.commentRepository.create(
        {
          ticket: { connect: { id: ticketId } },
          user: { connect: { id: userId } },
          content,
          type,
        },
        {
          user: {
            select: { id: true, name: true, email: true, role: true, avatarUrl: true },
          },
        },
      );

      for (const file of files) {
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        const filePath = buildSafeUploadPath(uploadDir, file.originalname);

        await this.storageService.save(file, filePath);
        createdFiles.push({ path: filePath });

        await this.attachmentRepository.create({
          ticket: { connect: { id: ticketId } },
          comment: { connect: { id: comment.id } },
          user: { connect: { id: userId } },
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          path: filePath,
          visibility: type === CommentType.INTERNAL ? AttachmentVisibility.INTERNAL : AttachmentVisibility.PUBLIC,
        });
      }

      return this.commentRepository.findById(comment.id, {
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
      });
    } catch (err) {
      for (const f of createdFiles) {
        try {
          await this.storageService.delete(f.path);
        } catch { /* ignore cleanup errors */ }
      }
      throw err;
    }
  }

  async findByTicketId(ticketId: string, userRole: string, userId: string) {
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

    const comments = await this.commentRepository.findByTicketId(ticketId, where);

    if (userRole !== Role.EndUser) {
      return comments;
    }

    return comments.map((comment: any) => ({
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
}
