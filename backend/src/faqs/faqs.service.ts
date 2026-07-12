import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FaqRepository } from '../common/repositories/faq.repository';
import { FaqInteractionRepository } from '../common/repositories/faq-interaction.repository';
import { SubCategoryRepository } from '../common/repositories/sub-category.repository';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { QueryFaqRecommendationsDto } from './dto/query-faq-recommendations.dto';
import { CreateFaqInteractionDto } from './dto/create-faq-interaction.dto';
import { QueryFaqAnalyticsDto } from './dto/query-faq-analytics.dto';
import { FaqInteractionType } from '@prisma/client';

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
  faq: { question: string; answer: string; keywords: string[] },
  queryTokens: string[],
): number {
  let score = 100;
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
    private readonly subCategoryRepository: SubCategoryRepository,
    private readonly faqInteractionRepository: FaqInteractionRepository,
  ) {}

  async findActiveOrdered() {
    return this.faqRepository.findActiveOrdered();
  }

  async findAll() {
    return this.faqRepository.findAll();
  }

  async getRecommendations(query: QueryFaqRecommendationsDto) {
    const subCategoryId = await this.requireActiveSubCategory(query.subCategoryId);

    const queryTokens = tokenize(query.query ?? '');
    const candidates = await this.faqRepository.findActiveForRecommendations(subCategoryId);

    return candidates
      .map((faq) => ({
        faq,
        score: scoreFaq(faq, queryTokens),
      }))
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
        subCategoryId: faq.subCategoryId,
      }));
  }

  async getAnalytics(query: QueryFaqAnalyticsDto) {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86_400_000);
    const [summary, topOpenedFaqs, topResolvedFaqs, categoryRows] = await Promise.all([
      this.faqInteractionRepository.getSummary(from),
      this.faqInteractionRepository.getTopOpenedFaqs(from),
      this.faqInteractionRepository.getTopResolvedFaqs(from),
      this.faqInteractionRepository.getCategoryStats(from),
    ]);

    const percentage = (value: number, total: number) =>
      total === 0 ? 0 : Math.round((value / total) * 1000) / 10;

    return {
      range: query.range,
      from: from.toISOString(),
      to: to.toISOString(),
      ...summary,
      deflectionRate: percentage(
        summary.resolvedWithoutTicketSessions,
        summary.recommendationSessions,
      ),
      continuedToTicketRate: percentage(
        summary.continuedToTicketSessions,
        summary.recommendationSessions,
      ),
      topOpenedFaqs,
      topResolvedFaqs,
      categoryStats: categoryRows.map((row) => ({
        subCategoryId: row.subCategoryId,
        subCategoryName: row.subCategoryName,
        recommendationSessions: row.recommendationSessions,
        resolvedWithoutTicketSessions: row.resolvedWithoutTicketSessions,
        deflectionRate: percentage(
          row.resolvedWithoutTicketSessions,
          row.recommendationSessions,
        ),
      })),
    };
  }

  async create(dto: CreateFaqDto) {
    const subCategory = await this.subCategoryRepository.findById(dto.subCategoryId);
    if (!subCategory) {
      throw new NotFoundException('Sub-category not found');
    }

    const { subCategoryId, ...fields } = dto;
    return this.faqRepository.create({
      ...fields,
      displayOrder: dto.displayOrder ?? 0,
      isActive: dto.isActive ?? true,
      showOnLogin: dto.showOnLogin ?? false,
      keywords: dto.keywords ?? [],
      subCategory: { connect: { id: subCategoryId } },
    });
  }

  async update(id: string, dto: UpdateFaqDto) {
    const faq = await this.faqRepository.findById(id);
    if (!faq) {
      throw new NotFoundException('FAQ not found');
    }

    const { subCategoryId, ...fields } = dto;

    if (subCategoryId) {
      const subCategory = await this.subCategoryRepository.findById(subCategoryId);
      if (!subCategory) {
        throw new NotFoundException('Sub-category not found');
      }
    }

    const subCategory = subCategoryId
      ? { connect: { id: subCategoryId } }
      : undefined;

    return this.faqRepository.update(id, {
      ...fields,
      ...(subCategory ? { subCategory } : {}),
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
    const subCategoryId = dto.eventType === FaqInteractionType.RecommendationsShown
      ? await this.requireActiveSubCategory(dto.subCategoryId)
      : (await this.requireActiveFaq(dto.faqId)).subCategoryId;

    await this.faqInteractionRepository.create({
      sessionId: dto.sessionId,
      userId,
      faqId: dto.faqId,
      subCategoryId,
      eventType: dto.eventType,
    });
  }

  private async requireActiveSubCategory(id: string | undefined): Promise<string> {
    if (!id) throw new BadRequestException('subCategoryId is required');
    const subCategory = await this.subCategoryRepository.findUnique({
      where: { id },
      include: { category: true },
    }) as { id: string; isActive: boolean; category: { isActive: boolean } } | null;
    if (!subCategory || !subCategory.isActive || !subCategory.category.isActive) {
      throw new NotFoundException('Sub-category not found or inactive');
    }
    return subCategory.id;
  }

  private async requireActiveFaq(id: string | undefined) {
    if (!id) throw new BadRequestException('faqId is required');
    const faq = await this.faqRepository.findActiveById(id);
    if (!faq) throw new NotFoundException('FAQ not found or inactive');
    return faq;
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
