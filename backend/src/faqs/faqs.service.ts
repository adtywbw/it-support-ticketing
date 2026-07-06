import { Injectable, NotFoundException } from '@nestjs/common';
import { FaqRepository } from '../common/repositories/faq.repository';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';

@Injectable()
export class FaqsService {
  constructor(private readonly faqRepository: FaqRepository) {}

  async findActiveOrdered() {
    return this.faqRepository.findActiveOrdered();
  }

  async findAll() {
    return this.faqRepository.findAll();
  }

  async create(dto: CreateFaqDto) {
    const data = {
      ...dto,
      displayOrder: dto.displayOrder ?? 0,
      isActive: dto.isActive ?? true,
    };
    return this.faqRepository.create(data);
  }

  async update(id: string, dto: UpdateFaqDto) {
    const faq = await this.faqRepository.findById(id);
    if (!faq) {
      throw new NotFoundException('FAQ not found');
    }
    return this.faqRepository.update(id, dto);
  }

  async remove(id: string): Promise<void> {
    const faq = await this.faqRepository.findById(id);
    if (!faq) {
      throw new NotFoundException('FAQ not found');
    }
    await this.faqRepository.delete(id);
  }
}
