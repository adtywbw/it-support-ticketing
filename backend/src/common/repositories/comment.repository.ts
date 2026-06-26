import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CommentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.CommentCreateInput, include?: Prisma.CommentInclude) {
    return this.prisma.comment.create({ data, include }) as any;
  }

  async findById(id: string, include?: Prisma.CommentInclude) {
    return this.prisma.comment.findUnique({ where: { id }, include }) as any;
  }

  async findByTicketId(ticketId: string, where?: Record<string, unknown>, pagination?: { skip: number; take: number }) {
    return this.prisma.comment.findMany({
      where: { ticketId, ...where } as any,
      orderBy: { createdAt: 'asc' },
      skip: pagination?.skip,
      take: pagination?.take,
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
    }) as any;
  }

  async countByTicketId(ticketId: string, where?: Record<string, unknown>) {
    return this.prisma.comment.count({ where: { ticketId, ...where } as any });
  }

  async deleteMany(where: Prisma.CommentWhereInput) {
    return this.prisma.comment.deleteMany({ where });
  }
}
