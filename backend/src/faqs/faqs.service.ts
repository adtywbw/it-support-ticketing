import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FaqRepository } from '../common/repositories/faq.repository';
import { FaqInteractionRepository } from '../common/repositories/faq-interaction.repository';
import { CategoryRepository } from '../common/repositories/category.repository';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { QueryFaqRecommendationsDto } from './dto/query-faq-recommendations.dto';
import { CreateFaqInteractionDto } from './dto/create-faq-interaction.dto';

function tokenize(value: string): string[] {
  return [...new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean),
  )];
}

function scoreFaq(
  faq: { question: string; answer: string; categoryId: string | null; keywords: string[] },
  categoryId: string | undefined,
  queryTokens: string[],
): number {
  let score = categoryId && faq.categoryId === categoryId ? 100 : 0;
  const questionTokens = new Set(tokenize(faq.question));
  const answerTokens = new Set(tokenize(faq.answer));
  const keywordTokens = new Set(faq.keywords.flatMap(tokenize));

  for (const token of queryTokens) {
    if (questionTokens.has(token)) score += 10;
    if (keywordTokens.has(token)) score += 8;
    if (answerTokens.has(token)) score += 2;
  }
  return score;
}

@Injectable()
export class FaqsService {
  private readonly logger = new Logger(FaqsService.name);

  constructor(
    private readonly faqRepository: FaqRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly faqInteractionRepository: FaqInteractionRepository,
  ) {}

  async findActiveOrdered() {
    return this.faqRepository.findActiveOrdered();
  }

  async findAll() {
    return this.faqRepository.findAll();
  }

  async getRecommendations(query: QueryFaqRecommendationsDto) {
    if (!query.categoryId && !query.query) {
      throw new BadRequestException('categoryId or query is required');
    }

    if (query.categoryId && !(await this.categoryRepository.findById(query.categoryId))) {
      throw new NotFoundException('Category not found');
    }

    const queryTokens = tokenize(query.query ?? '');
    const candidates = await this.faqRepository.findActiveForRecommendations();

    return candidates
      .map((faq) => ({
        faq,
        score: scoreFaq(faq, query.categoryId, queryTokens),
      }))
      .filter(({ score }) => score > 0)
      .sort((left, right) =>
        right.score - left.score ||
        left.faq.displayOrder - right.faq.displayOrder ||
        right.faq.updatedAt.getTime() - left.faq.updatedAt.getTime(),
      )
      .slice(0, 5)
      .map(({ faq }) => ({
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
        displayOrder: faq.displayOrder,
        categoryId: faq.categoryId,
      }));
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

  async recordInteraction(dto: CreateFaqInteractionDto, userId: string): Promise<void> {
    if (dto.faqId && !(await this.faqRepository.findById(dto.faqId))) {
      throw new NotFoundException('FAQ not found');
    }
    if (dto.categoryId && !(await this.categoryRepository.findById(dto.categoryId))) {
      throw new NotFoundException('Category not found');
    }

    await this.faqInteractionRepository.create({
      sessionId: dto.sessionId,
      userId,
      faqId: dto.faqId,
      categoryId: dto.categoryId,
      eventType: dto.eventType,
    });
  }

  @Cron('30 3 * * *')
  async cleanupOldInteractions(): Promise<void> {
    const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    try {
      const count = await this.faqInteractionRepository.deleteOlderThan(cutoff);
      if (count > 0) this.logger.log(`Deleted ${count} expired FAQ interactions`);
    } catch (error) {
      this.logger.error('Failed to clean up FAQ interactions', error instanceof Error ? error.stack : undefined);
    }
  }
}
