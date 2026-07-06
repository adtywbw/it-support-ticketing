import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CommentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.CommentCreateInput, include?: Prisma.CommentInclude) {
    return this.prisma.comment.create({ data, include });
  }

  async findById(id: string, include?: Prisma.CommentInclude) {
    return this.prisma.comment.findUnique({ where: { id }, include });
  }

  async findByTicketId(
    ticketId: string,
    where?: Prisma.CommentWhereInput,
    pagination?: { skip: number; take: number },
    include?: Prisma.CommentInclude,
  ) {
    const defaultInclude: Prisma.CommentInclude = {
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
    };
    return this.prisma.comment.findMany({
      where: { ticketId, ...where },
      orderBy: { createdAt: 'asc' },
      skip: pagination?.skip,
      take: pagination?.take,
      include: include ?? defaultInclude,
    });
  }

  async countByTicketId(ticketId: string, where?: Prisma.CommentWhereInput) {
    return this.prisma.comment.count({ where: { ticketId, ...where } });
  }

  async deleteMany(where: Prisma.CommentWhereInput) {
    return this.prisma.comment.deleteMany({ where });
  }

  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ) {
    return this.prisma.$transaction(fn, options);
  }
}
