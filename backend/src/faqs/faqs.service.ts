import { Injectable, NotFoundException } from '@nestjs/common';
import { FaqRepository } from '../common/repositories/faq.repository';
import { CategoryRepository } from '../common/repositories/category.repository';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';

@Injectable()
export class FaqsService {
  constructor(
    private readonly faqRepository: FaqRepository,
    private readonly categoryRepository: CategoryRepository,
  ) {}

  async findActiveOrdered() {
    return this.faqRepository.findActiveOrdered();
  }

  async findAll() {
    return this.faqRepository.findAll();
  }

  async create(dto: CreateFaqDto) {
    if (dto.categoryId) {
      const category = await this.categoryRepository.findById(dto.categoryId);
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    const { categoryId, ...fields } = dto;
    return this.faqRepository.create({
      ...fields,
      displayOrder: dto.displayOrder ?? 0,
      isActive: dto.isActive ?? true,
      keywords: dto.keywords ?? [],
      category: categoryId ? { connect: { id: categoryId } } : undefined,
    });
  }

  async update(id: string, dto: UpdateFaqDto) {
    const faq = await this.faqRepository.findById(id);
    if (!faq) {
      throw new NotFoundException('FAQ not found');
    }

    const { categoryId, ...fields } = dto;

    if (categoryId) {
      const category = await this.categoryRepository.findById(categoryId);
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    const category = categoryId === null
      ? { disconnect: true }
      : categoryId
        ? { connect: { id: categoryId } }
        : undefined;

    return this.faqRepository.update(id, {
      ...fields,
      ...(category ? { category } : {}),
    });
  }

  async remove(id: string): Promise<void> {
    const faq = await this.faqRepository.findById(id);
    if (!faq) {
      throw new NotFoundException('FAQ not found');
    }
    await this.faqRepository.delete(id);
  }
}
