import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AttachmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.AttachmentCreateInput, include?: Prisma.AttachmentInclude) {
    return this.prisma.attachment.create({ data, include }) as any;
  }

  async findByTicketId(ticketId: string, args?: { include?: Prisma.AttachmentInclude; select?: Prisma.AttachmentSelect }) {
    return this.prisma.attachment.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
      ...args,
    }) as any;
  }

  async findById(id: string, include?: Prisma.AttachmentInclude) {
    return this.prisma.attachment.findUnique({ where: { id }, include }) as any;
  }

  async count(where: Prisma.AttachmentWhereInput) {
    return this.prisma.attachment.count({ where });
  }

  async deleteMany(where: Prisma.AttachmentWhereInput) {
    return this.prisma.attachment.deleteMany({ where });
  }
}
