import {
  Controller,
  Get,
  Post,
  Param,
  Body,
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

@Controller('tickets/:ticketId/comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  async findByTicketId(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.commentsService.findByTicketId(ticketId, user.role, user.id);
  }

  @Post()
  @UseInterceptors(FilesInterceptor('files', 3))
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
