import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CategoryRepository } from '../common/repositories/category.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async findAll(userRole: Role) {
    if (userRole === Role.Admin) {
      return this.categoryRepository.findAll();
    }
    return this.categoryRepository.findAllForTicketForm();
  }

  async findById(id: string, userRole: Role) {
    const category = userRole === Role.Admin
      ? await this.categoryRepository.findById(id)
      : await this.categoryRepository.findByIdForTicketForm(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async create(createCategoryDto: CreateCategoryDto) {
    const existing = await this.categoryRepository.findByName(createCategoryDto.name);

    if (existing) {
      if (!existing.isActive) {
        return this.categoryRepository.update(
          existing.id,
          {
            isActive: true,
            description: createCategoryDto.description ?? existing.description,
          },
          { subCategories: true },
        );
      }
      throw new ConflictException('Category with this name already exists');
    }

    return this.categoryRepository.create(
      {
        name: createCategoryDto.name,
        description: createCategoryDto.description,
      },
      { subCategories: true },
    );
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (updateCategoryDto.name) {
      const existing = await this.categoryRepository.findByName(updateCategoryDto.name);
      if (existing && existing.id !== id) {
        throw new ConflictException('Category with this name already exists');
      }
    }

    return this.categoryRepository.update(id, updateCategoryDto, {
      subCategories: true,
    });
  }

  async delete(id: string): Promise<void> {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const hasRelations =
      (category._count?.tickets ?? 0) > 0 ||
      (category._count?.subCategories ?? 0) > 0 ||
      (category._count?.slaConfigs ?? 0) > 0;

    if (hasRelations) {
      await this.categoryRepository.update(id, { isActive: false });
    } else {
      await this.categoryRepository.delete(id);
    }
  }
}
