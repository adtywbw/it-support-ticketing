import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CommentType, Role } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { Express } from 'express';
import { AttachmentRepository } from '../common/repositories/attachment.repository';
import { TicketRepository } from '../common/repositories/ticket.repository';
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
    private readonly attachmentRepository: AttachmentRepository,
    private readonly ticketRepository: TicketRepository,
    @Inject('StorageService')
    private readonly storageService: StorageService,
  ) {}

  async upload(ticketId: string, file: Express.Multer.File, userId: string, userRole: string) {
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

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    const uniqueName = `${uuidv4()}-${file.originalname}`;
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const filePath = `${uploadDir}/${uniqueName}`;

    await this.storageService.save(file, filePath);

    const attachment = await this.attachmentRepository.create(
      {
        ticket: { connect: { id: ticketId } },
        user: { connect: { id: userId } },
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: filePath,
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
      user: { select: { id: true, name: true } },
      comment: { select: { type: true } },
    });

    if (userRole !== Role.EndUser) {
      return attachments;
    }

    return attachments.filter(
      (attachment: { comment?: { type: CommentType } | null }) =>
        attachment.comment?.type !== CommentType.INTERNAL,
    );
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

    if (userRole === Role.EndUser && attachment.comment?.type === CommentType.INTERNAL) {
      throw new ForbiddenException('Access denied');
    }

    return attachment;
  }
}
