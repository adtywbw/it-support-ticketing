import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
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
    return this.commentsService.findByTicketId(ticketId, user.role);
  }

  @Post()
  async create(
    @Param('ticketId') ticketId: string,
    @Body() createCommentDto: CreateCommentDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.commentsService.create(
      ticketId,
      createCommentDto,
      user.id,
      user.role,
    );
  }
}
