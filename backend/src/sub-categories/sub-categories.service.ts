import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCategoryId(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return this.prisma.subCategory.findMany({
      where: { categoryId, isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { tickets: true } } },
    });
  }

  async create(data: { categoryId: string; name: string; description?: string }) {
    const category = await this.prisma.category.findUnique({
      where: { id: data.categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const existing = await this.prisma.subCategory.findUnique({
      where: { categoryId_name: { categoryId: data.categoryId, name: data.name } },
    });

    if (existing) {
      if (!existing.isActive) {
        return this.prisma.subCategory.update({
          where: { id: existing.id },
          data: { isActive: true, description: data.description ?? existing.description },
        });
      }
      throw new ConflictException(
        'Sub-category with this name already exists in this category',
      );
    }

    return this.prisma.subCategory.create({
      data,
    });
  }

  async update(
    id: string,
    data: { name?: string; description?: string; isActive?: boolean },
  ) {
    const subCategory = await this.prisma.subCategory.findUnique({
      where: { id },
    });

    if (!subCategory) {
      throw new NotFoundException('Sub-category not found');
    }

    if (data.name && data.name !== subCategory.name) {
      const existing = await this.prisma.subCategory.findUnique({
        where: {
          categoryId_name: {
            categoryId: subCategory.categoryId,
            name: data.name,
          },
        },
      });
      if (existing) {
        throw new ConflictException(
          'Sub-category with this name already exists in this category',
        );
      }
    }

    return this.prisma.subCategory.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    const subCategory = await this.prisma.subCategory.findUnique({
      where: { id },
      include: { _count: { select: { tickets: true } } },
    });

    if (!subCategory) {
      throw new NotFoundException('Sub-category not found');
    }

    if (subCategory._count.tickets > 0) {
      await this.prisma.subCategory.update({
        where: { id },
        data: { isActive: false },
      });
    } else {
      await this.prisma.subCategory.delete({ where: { id } });
    }
  }
}
