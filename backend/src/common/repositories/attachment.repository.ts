import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AttachmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.AttachmentCreateInput, include?: Prisma.AttachmentInclude) {
    return this.prisma.attachment.create({ data, include });
  }

  async findByTicketId(ticketId: string, args?: {
    include?: Prisma.AttachmentInclude;
    select?: Prisma.AttachmentSelect;
    skip?: number;
    take?: number;
    where?: Prisma.AttachmentWhereInput;
  }) {
    const { select, include, skip, take, where } = args ?? {};
    return this.prisma.attachment.findMany({
      where: where ?? { ticketId },
      orderBy: { createdAt: 'desc' },
      ...(skip !== undefined ? { skip } : {}),
      ...(take !== undefined ? { take } : {}),
      ...(select ? { select } : {}),
      ...(!select && include ? { include } : {}),
    });
  }

  async findById<T extends Prisma.AttachmentFindUniqueArgs>(args: T): Promise<Prisma.AttachmentGetPayload<T> | null> {
    return this.prisma.attachment.findUnique(args) as unknown as Prisma.AttachmentGetPayload<T> | null;
  }

  async findUnique<T extends Prisma.AttachmentFindUniqueArgs>(args: T): Promise<Prisma.AttachmentGetPayload<T> | null> {
    return this.prisma.attachment.findUnique(args) as unknown as Prisma.AttachmentGetPayload<T> | null;
  }

  async count(where: Prisma.AttachmentWhereInput) {
    return this.prisma.attachment.count({ where });
  }

  async deleteMany(where: Prisma.AttachmentWhereInput) {
    return this.prisma.attachment.deleteMany({ where });
  }

  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ) {
    return this.prisma.$transaction(fn, options);
  }
}
