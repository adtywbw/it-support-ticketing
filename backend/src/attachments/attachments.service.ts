import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { Express } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './interfaces/storage-service.interface';

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

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES_PER_TICKET = 5;

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('StorageService')
    private readonly storageService: StorageService,
  ) {}

  async upload(ticketId: string, file: Express.Multer.File, userId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const attachmentCount = await this.prisma.attachment.count({
      where: { ticketId },
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

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    const uniqueName = `${uuidv4()}-${file.originalname}`;
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const filePath = `${uploadDir}/${uniqueName}`;

    await this.storageService.save(file, filePath);

    const attachment = await this.prisma.attachment.create({
      data: {
        ticketId,
        userId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: filePath,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return attachment;
  }

  async findByTicketId(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return this.prisma.attachment.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true } },
      },
    });
  }

  async getDownloadInfo(id: string, userId: string, userRole: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: {
        ticket: { select: { requesterId: true } },
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    if (userRole === Role.EndUser && attachment.ticket.requesterId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return attachment;
  }
}
