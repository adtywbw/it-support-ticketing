import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Role, CommentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    ticketId: string,
    createCommentDto: CreateCommentDto,
    userId: string,
    userRole: string,
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (
      createCommentDto.type === CommentType.INTERNAL &&
      userRole === Role.EndUser
    ) {
      throw new ForbiddenException(
        'End users cannot create internal comments',
      );
    }

    const comment = await this.prisma.comment.create({
      data: {
        ticketId,
        userId,
        content: createCommentDto.content,
        type: createCommentDto.type || CommentType.PUBLIC,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    return comment;
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
      },
    });
  }
}
