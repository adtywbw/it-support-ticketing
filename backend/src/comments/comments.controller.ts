import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Role, CommentType } from '@prisma/client';
import { CommentsService } from './comments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ALLOWED_MIME_TYPES } from '../common/utils/mime-validation.util';
import { appConfig } from '../common/config/app.config';

const MAX_FILE_SIZE = appConfig.fileUpload.maxCommentFileSize;
const MAX_FILES_PER_COMMENT = appConfig.fileUpload.maxFilesPerComment;

@Controller('tickets/:ticketId/comments')
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
    @Body() createCommentDto: CreateCommentDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: { id: string; role: Role },
  ) {
    const commentType = createCommentDto.type === CommentType.INTERNAL ? CommentType.INTERNAL : CommentType.PUBLIC;

    return this.commentsService.create(
      ticketId,
      createCommentDto.content.trim(),
      commentType,
      files || [],
      user.id,
      user.role,
    );
  }
}
