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
    });
  }

  async create(data: Prisma.SubCategoryCreateInput) {
    return this.prisma.subCategory.create({ data });
  }

  async findById<T extends Prisma.SubCategoryFindUniqueArgs['include']>(
    id: string,
    include?: T,
  ) {
    const args: Prisma.SubCategoryFindUniqueArgs = { where: { id } };
    if (include) args.include = include;
    return this.prisma.subCategory.findUnique(args);
  }

  async findUnique<T extends Prisma.SubCategoryFindUniqueArgs>(args: T) {
    return this.prisma.subCategory.findUnique(args);
  }

  async findByCategoryAndName(categoryId: string, name: string) {
    return this.prisma.subCategory.findUnique({
      where: { categoryId_name: { categoryId, name } },
    });
  }

  async update(id: string, data: Prisma.SubCategoryUpdateInput) {
    return this.prisma.subCategory.update({ where: { id }, data });
  }

  async delete(id: string) {
    return this.prisma.subCategory.delete({ where: { id } });
  }
}
