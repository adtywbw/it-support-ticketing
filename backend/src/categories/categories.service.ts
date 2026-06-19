import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
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
    });
  }

  async findById(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        subCategories: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
        slaConfigs: true,
        _count: { select: { tickets: true } },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async create(createCategoryDto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { name: createCategoryDto.name },
    });

    if (existing) {
      if (!existing.isActive) {
        return this.prisma.category.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            description: createCategoryDto.description ?? existing.description,
          },
          include: { subCategories: true },
        });
      }
      throw new ConflictException('Category with this name already exists');
    }

    return this.prisma.category.create({
      data: {
        name: createCategoryDto.name,
        description: createCategoryDto.description,
      },
      include: {
        subCategories: true,
      },
    });
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (updateCategoryDto.name) {
      const existing = await this.prisma.category.findUnique({
        where: { name: updateCategoryDto.name },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Category with this name already exists');
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
      include: {
        subCategories: true,
      },
    });
  }

  async delete(id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { tickets: true } } },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category._count.tickets > 0) {
      await this.prisma.category.update({
        where: { id },
        data: { isActive: false },
      });
    } else {
      await this.prisma.category.delete({ where: { id } });
    }
  }
}
