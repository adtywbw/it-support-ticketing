import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        subCategories: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
        _count: { select: { tickets: true } },
      },
    }) as any;
  }

  async findById(id: string, include?: Prisma.CategoryInclude) {
    return this.prisma.category.findUnique({
      where: { id },
      include: include || {
        subCategories: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
        slaConfigs: true,
        _count: { select: { tickets: true } },
      },
    }) as any;
  }

  async findByName(name: string) {
    return this.prisma.category.findUnique({ where: { name } }) as any;
  }

  async create(data: Prisma.CategoryCreateInput, include?: Prisma.CategoryInclude) {
    return this.prisma.category.create({ data, include }) as any;
  }

  async update(id: string, data: Prisma.CategoryUpdateInput, include?: Prisma.CategoryInclude) {
    return this.prisma.category.update({ where: { id }, data, include }) as any;
  }

  async delete(id: string) {
    return this.prisma.category.delete({ where: { id } }) as any;
  }

  async findWithTicketCount(id: string) {
    return this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { tickets: true } } },
    }) as any;
  }
}
