import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class SubCategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCategoryId(categoryId: string) {
    return this.prisma.subCategory.findMany({
      where: { categoryId, isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { tickets: true } } },
    }) as any;
  }

  async create(data: Prisma.SubCategoryCreateInput) {
    return this.prisma.subCategory.create({ data }) as any;
  }

  async findById(id: string, include?: Prisma.SubCategoryInclude) {
    return this.prisma.subCategory.findUnique({ where: { id }, include }) as any;
  }

  async findByCategoryAndName(categoryId: string, name: string) {
    return this.prisma.subCategory.findUnique({
      where: { categoryId_name: { categoryId, name } },
    }) as any;
  }

  async update(id: string, data: Prisma.SubCategoryUpdateInput) {
    return this.prisma.subCategory.update({ where: { id }, data }) as any;
  }

  async delete(id: string) {
    return this.prisma.subCategory.delete({ where: { id } }) as any;
  }
}
