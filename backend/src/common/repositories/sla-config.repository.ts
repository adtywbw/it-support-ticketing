import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class SlaConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUnique(where: Prisma.SLAConfigWhereUniqueInput) {
    return this.prisma.sLAConfig.findUnique({ where });
  }

  async findFirst(args: Prisma.SLAConfigFindFirstArgs) {
    return this.prisma.sLAConfig.findFirst(args);
  }

  async findAll() {
    return this.prisma.sLAConfig.findMany({
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ categoryId: 'asc' }, { priority: 'asc' }],
    });
  }

  async create(data: Prisma.SLAConfigCreateInput) {
    return this.prisma.sLAConfig.create({ data });
  }

  async update(id: string, data: Prisma.SLAConfigUpdateInput) {
    return this.prisma.sLAConfig.update({ where: { id }, data });
  }
}
