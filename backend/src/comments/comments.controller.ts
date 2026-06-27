import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Role, CommentType } from '@prisma/client';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

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

@Controller('tickets/:ticketId/comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  async findByTicketId(
    @Param('ticketId') ticketId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.commentsService.findByTicketId(ticketId, user.role, user.id, query.page ?? 1, query.limit ?? 20);
  }

  @Post()
  @UseInterceptors(FilesInterceptor('files', MAX_FILES_PER_COMMENT, {
    limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_COMMENT },
    fileFilter: (_req, file, callback) => {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        callback(new BadRequestException(`File type ${file.mimetype} is not allowed`), false);
        return;
      }
      callback(null, true);
    },
  }))
  async create(
    @Param('ticketId') ticketId: string,
    @Body('content') content: string,
    @Body('type') type: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: { id: string; role: Role },
  ) {
    if (!content?.trim()) {
      throw new BadRequestException('Content is required');
    }

    const commentType = type === 'INTERNAL' ? CommentType.INTERNAL : CommentType.PUBLIC;

    return this.commentsService.create(
      ticketId,
      content.trim(),
      commentType,
      files || [],
      user.id,
      user.role,
    );
  }
}
