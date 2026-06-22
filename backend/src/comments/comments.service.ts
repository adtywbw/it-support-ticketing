import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Express } from 'express';
import { Role, CommentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../attachments/interfaces/storage-service.interface';

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

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
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
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (type === CommentType.INTERNAL && userRole === Role.EndUser) {
      throw new ForbiddenException(
        'End users cannot create internal comments',
      );
    }

    if (files.length > MAX_FILES_PER_COMMENT) {
      throw new BadRequestException(
        `Maximum ${MAX_FILES_PER_COMMENT} files per comment`,
      );
    }

    const comment = await this.prisma.comment.create({
      data: {
        ticketId,
        userId,
        content,
        type,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, avatarUrl: true },
        },
      },
    });

    if (files.length > 0) {
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

        const uniqueName = `${uuidv4()}-${file.originalname}`;
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        const filePath = `${uploadDir}/${uniqueName}`;

        await this.storageService.save(file, filePath);

        await this.prisma.attachment.create({
          data: {
            ticketId,
            commentId: comment.id,
            userId,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            path: filePath,
          },
        });
      }
    }

    return this.prisma.comment.findUnique({
      where: { id: comment.id },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, avatarUrl: true },
        },
        attachments: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async findByTicketId(ticketId: string, userRole: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const where: Record<string, unknown> = { ticketId };

    if (userRole === Role.EndUser) {
      where.type = CommentType.PUBLIC;
    }

    return this.prisma.comment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, avatarUrl: true },
        },
        attachments: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
    });
  }
}
