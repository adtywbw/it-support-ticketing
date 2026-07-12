import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SubCategoryRepository } from '../common/repositories/sub-category.repository';
import { CategoryRepository } from '../common/repositories/category.repository';

@Injectable()
export class SubCategoriesService {
  constructor(
    private readonly subCategoryRepository: SubCategoryRepository,
    private readonly categoryRepository: CategoryRepository,
  ) {}

  async findByCategoryId(categoryId: string, role?: string) {
    const category = await this.categoryRepository.findById(categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const includeInactive = role === 'Admin';
    return this.subCategoryRepository.findByCategoryId(categoryId, includeInactive);
  }

  async create(data: { categoryId: string; name: string; description?: string }) {
    const category = await this.categoryRepository.findById(data.categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const existing = await this.subCategoryRepository.findByCategoryAndName(
      data.categoryId,
      data.name,
    );

    if (existing) {
      if (!existing.isActive) {
        return this.subCategoryRepository.update(existing.id, {
          isActive: true,
          description: data.description ?? existing.description,
        });
      }
      throw new ConflictException(
        'Sub-category with this name already exists in this category',
      );
    }

    return this.subCategoryRepository.create({
      category: { connect: { id: data.categoryId } },
      name: data.name,
      description: data.description,
    });
  }

  async update(
    id: string,
    data: { name?: string; description?: string; isActive?: boolean },
  ) {
    const subCategory = await this.subCategoryRepository.findUnique({ where: { id } });
    if (!subCategory) {
      throw new NotFoundException('Sub-category not found');
    }

    if (data.name && data.name !== subCategory.name) {
      const existing = await this.subCategoryRepository.findByCategoryAndName(
        subCategory.categoryId,
        data.name,
      );
      if (existing) {
        throw new ConflictException(
          'Sub-category with this name already exists in this category',
        );
      }
    }

    return this.subCategoryRepository.update(id, data);
  }

  async delete(id: string): Promise<void> {
    const subCategory = await this.subCategoryRepository.findUnique({
      where: { id },
      include: { _count: { select: { tickets: true, faqs: true } } },
    }) as Prisma.SubCategoryGetPayload<{
      include: { _count: { select: { tickets: true; faqs: true } } };
    }> | null;

    if (!subCategory) {
      throw new NotFoundException('Sub-category not found');
    }

    if (subCategory._count.tickets > 0 || subCategory._count.faqs > 0) {
      throw new ConflictException(
        `Cannot delete: ${subCategory._count.tickets} ticket(s) and ${subCategory._count.faqs} FAQ(s) still use this sub-category. Deactivate it instead.`,
      );
    } else {
      await this.subCategoryRepository.delete(id);
    }
  }
}
