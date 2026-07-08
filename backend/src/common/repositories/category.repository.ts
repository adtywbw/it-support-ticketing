import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeInactive?: boolean) {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        subCategories: {
          where: includeInactive ? undefined : { isActive: true },
          orderBy: { name: 'asc' },
          include: { _count: { select: { tickets: true } } },
        },
        slaConfigs: includeInactive ? undefined : { where: { isActive: true } },
        _count: { select: { tickets: true, subCategories: true, slaConfigs: true } },
      },
    });
  }

  async findAllForTicketForm() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        subCategories: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            categoryId: true,
            isActive: true,
          },
        },
      },
    });
  }

  async findByIdForTicketForm(id: string) {
    return this.prisma.category.findFirst({
      where: { id, isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        subCategories: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            categoryId: true,
            isActive: true,
          },
        },
      },
    });
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
        _count: { select: { tickets: true, subCategories: true, slaConfigs: true } },
      },
    });
  }

  async findByName(name: string) {
    return this.prisma.category.findUnique({ where: { name } });
  }

  async create(data: Prisma.CategoryCreateInput, include?: Prisma.CategoryInclude) {
    return this.prisma.category.create({ data, include });
  }

  async update(id: string, data: Prisma.CategoryUpdateInput, include?: Prisma.CategoryInclude) {
    return this.prisma.category.update({ where: { id }, data, include });
  }

  async delete(id: string) {
    return this.prisma.category.delete({ where: { id } });
  }
}
