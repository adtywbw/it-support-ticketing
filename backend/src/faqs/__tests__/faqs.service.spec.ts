import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { FaqsService } from '../faqs.service';
import { FaqRepository } from '../../common/repositories/faq.repository';
import { SubCategoryRepository } from '../../common/repositories/sub-category.repository';
import { FaqInteractionRepository } from '../../common/repositories/faq-interaction.repository';
import { FaqInteractionType } from '@prisma/client';

describe('FaqsService', () => {
  let service: FaqsService;
  let repo: jest.Mocked<Pick<
    FaqRepository,
    'findActiveOrdered' | 'findAll' | 'findById' | 'create' | 'update' | 'delete' | 'findActiveForRecommendations' | 'findActiveById'
  >>;
  let subCategoryRepository: jest.Mocked<Pick<SubCategoryRepository, 'findById' | 'findUnique'>>;
  let interactionRepository: jest.Mocked<Pick<FaqInteractionRepository, 'create' | 'deleteOlderThan' | 'getSummary' | 'getTopOpenedFaqs' | 'getTopResolvedFaqs' | 'getSubCategoryStats'>>;

  const subCategoryId = 'sc-uuid';
  const faqId = 'faq-uuid';
  const sessionId = 'session-uuid';
  const userId = 'user-uuid';
  const interactionId = 'interaction-uuid';

  beforeEach(() => {
    repo = {
      findActiveOrdered: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findActiveForRecommendations: jest.fn(),
      findActiveById: jest.fn(),
    };
    subCategoryRepository = {
      findById: jest.fn(),
      findUnique: jest.fn(),
    };
    interactionRepository = {
      create: jest.fn(),
      deleteOlderThan: jest.fn(),
      getSummary: jest.fn(),
      getTopOpenedFaqs: jest.fn(),
      getTopResolvedFaqs: jest.fn(),
      getSubCategoryStats: jest.fn(),
    };
    service = new FaqsService(repo as any, subCategoryRepository as any, interactionRepository as any);
  });

  const subCategory = { id: 'sc-uuid', name: 'Sub', category: { id: 'cat-uuid', name: 'Cat' } };
  const faq = { id: 'a', question: 'Q', answer: 'A', displayOrder: 0, isActive: true, showOnLogin: false, subCategoryId: 'sc-uuid', subCategory, keywords: [], createdAt: new Date(), updatedAt: new Date() };

  describe('findActiveOrdered', () => {
    it('delegates to repository.findActiveOrdered', async () => {
      repo.findActiveOrdered.mockResolvedValue([faq]);
      await expect(service.findActiveOrdered()).resolves.toEqual([faq]);
      expect(repo.findActiveOrdered).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('delegates to repository.findAll', async () => {
      repo.findAll.mockResolvedValue([faq]);
      await expect(service.findAll()).resolves.toEqual([faq]);
      expect(repo.findAll).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('delegates to repository.create with dto', async () => {
      subCategoryRepository.findById.mockResolvedValue({ id: subCategoryId } as any);
      repo.create.mockResolvedValue(faq);
      await expect(service.create({ question: 'Q', answer: 'A', subCategoryId } as any)).resolves.toEqual(faq);
      expect(repo.create).toHaveBeenCalledWith({ question: 'Q', answer: 'A', displayOrder: 0, isActive: true, showOnLogin: false, keywords: [], subCategory: { connect: { id: subCategoryId } } });
    });
  });

  describe('update', () => {
    it('throws NotFoundException when faq does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.update('missing', { question: 'X' } as any)).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('updates when faq exists', async () => {
      repo.findById.mockResolvedValue(faq);
      repo.update.mockResolvedValue({ ...faq, question: 'X' });
      await expect(service.update('a', { question: 'X' } as any)).resolves.toMatchObject({ question: 'X' });
      expect(repo.update).toHaveBeenCalledWith('a', { question: 'X' });
    });

    it('partial update does not override displayOrder with 0 when only isActive is sent', async () => {
      repo.findById.mockResolvedValue(faq);
      repo.update.mockResolvedValue({ ...faq, isActive: false });
      await expect(service.update('a', { isActive: false } as any)).resolves.toMatchObject({ isActive: false });
      expect(repo.update).toHaveBeenCalledWith('a', { isActive: false });
    });
  });

  describe('create with metadata', () => {
    it('creates FAQ metadata with a sub-category relation', async () => {
      subCategoryRepository.findById.mockResolvedValue({ id: subCategoryId } as any);
      repo.create.mockResolvedValue({ id: faqId } as any);

      await service.create({
        question: 'Reset Wi-Fi',
        answer: 'Restart the adapter.',
        subCategoryId,
        keywords: ['wi-fi'],
      });

      expect(repo.create).toHaveBeenCalledWith({
        question: 'Reset Wi-Fi',
        answer: 'Restart the adapter.',
        displayOrder: 0,
        isActive: true,
        showOnLogin: false,
        keywords: ['wi-fi'],
        subCategory: { connect: { id: subCategoryId } },
      });
    });
  });

  describe('update with metadata', () => {
    it('updates subCategoryId', async () => {
      repo.findById.mockResolvedValue({ id: faqId } as any);
      subCategoryRepository.findById.mockResolvedValue({ id: 'new-sc-uuid' } as any);
      repo.update.mockResolvedValue({ id: faqId } as any);

      await service.update(faqId, { subCategoryId: 'new-sc-uuid' });

      expect(repo.update).toHaveBeenCalledWith(faqId, {
        subCategory: { connect: { id: 'new-sc-uuid' } },
      });
    });
  });

  describe('getRecommendations', () => {
    it('returns only exact-sub-category candidates and preserves text ranking', async () => {
      subCategoryRepository.findUnique.mockResolvedValue({
        id: subCategoryId, isActive: true, category: { isActive: true },
      } as any);
      repo.findActiveForRecommendations.mockResolvedValue([
        { id: 'keyword', question: 'Network guide', answer: 'Steps', subCategoryId, keywords: ['wifi'], displayOrder: 2, updatedAt: new Date('2026-01-01') },
        { id: 'question', question: 'Reset wifi adapter', answer: 'Steps', subCategoryId, keywords: [], displayOrder: 1, updatedAt: new Date('2026-01-01') },
      ]);

      const result = await service.getRecommendations({ subCategoryId, query: 'wifi' });

      expect(repo.findActiveForRecommendations).toHaveBeenCalledWith(subCategoryId);
      expect(result.map((r) => r.id)).toEqual(['question', 'keyword']);
      expect(result.every((r) => r.subCategoryId === subCategoryId)).toBe(true);
    });

    it('rejects a request without subCategoryId', async () => {
      await expect(service.getRecommendations({} as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when faq does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('deletes when faq exists', async () => {
      repo.findById.mockResolvedValue(faq);
      repo.delete.mockResolvedValue(faq);
      await expect(service.remove('a')).resolves.toBeUndefined();
      expect(repo.delete).toHaveBeenCalledWith('a');
    });
  });

  describe('recordInteraction', () => {
    it('derives sub-category from the FAQ for ArticleOpened', async () => {
      repo.findActiveById.mockResolvedValue({ id: faqId, subCategoryId });

      await service.recordInteraction({ sessionId, faqId, eventType: FaqInteractionType.ArticleOpened }, userId);

      expect(interactionRepository.create).toHaveBeenCalledWith({
        sessionId, userId, faqId, subCategoryId, eventType: FaqInteractionType.ArticleOpened,
      });
    });

    it('derives sub-category from the FAQ for ProblemResolved', async () => {
      repo.findActiveById.mockResolvedValue({ id: faqId, subCategoryId });

      await service.recordInteraction({ sessionId, faqId, eventType: FaqInteractionType.ProblemResolved }, userId);

      expect(interactionRepository.create).toHaveBeenCalledWith({
        sessionId, userId, faqId, subCategoryId, eventType: FaqInteractionType.ProblemResolved,
      });
    });

    it('throws NotFoundException when FAQ is not found or inactive', async () => {
      repo.findActiveById.mockResolvedValue(null);

      await expect(
        service.recordInteraction({ sessionId, faqId, eventType: FaqInteractionType.ArticleOpened }, userId),
      ).rejects.toThrow(NotFoundException);
      expect(interactionRepository.create).not.toHaveBeenCalled();
    });

    it('records RecommendationsShown with subCategoryId', async () => {
      subCategoryRepository.findUnique.mockResolvedValue({
        id: subCategoryId, isActive: true, category: { isActive: true },
      } as any);

      await service.recordInteraction({ sessionId, subCategoryId, eventType: FaqInteractionType.RecommendationsShown }, userId);

      expect(interactionRepository.create).toHaveBeenCalledWith({
        sessionId, userId, faqId: undefined, subCategoryId, eventType: FaqInteractionType.RecommendationsShown,
      });
    });

    it('throws NotFoundException when sub-category is inactive for RecommendationsShown', async () => {
      subCategoryRepository.findUnique.mockResolvedValue(null);

      await expect(
        service.recordInteraction({ sessionId, subCategoryId, eventType: FaqInteractionType.RecommendationsShown }, userId),
      ).rejects.toThrow(NotFoundException);
      expect(interactionRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('getAnalytics', () => {
    it('returns zero rates when no recommendation sessions exist', async () => {
      interactionRepository.getSummary.mockResolvedValue({
        recommendationSessions: 0,
        resolvedWithoutTicketSessions: 0,
        continuedToTicketSessions: 0,
      });
      interactionRepository.getTopOpenedFaqs.mockResolvedValue([]);
      interactionRepository.getTopResolvedFaqs.mockResolvedValue([]);
      interactionRepository.getSubCategoryStats.mockResolvedValue([]);

      const result = await service.getAnalytics({ range: '30d' });

      expect(result.deflectionRate).toBe(0);
      expect(result.continuedToTicketRate).toBe(0);
      expect(result.range).toBe('30d');
    });

    it('rounds rates to one decimal', async () => {
      interactionRepository.getSummary.mockResolvedValue({
        recommendationSessions: 3,
        resolvedWithoutTicketSessions: 1,
        continuedToTicketSessions: 2,
      });
      interactionRepository.getTopOpenedFaqs.mockResolvedValue([]);
      interactionRepository.getTopResolvedFaqs.mockResolvedValue([]);
      interactionRepository.getSubCategoryStats.mockResolvedValue([]);

      const result = await service.getAnalytics({ range: '30d' });
      expect(result.deflectionRate).toBe(33.3);
      expect(result.continuedToTicketRate).toBe(66.7);
    });

    it('maps sub-category analytics and rates', async () => {
      interactionRepository.getSummary.mockResolvedValue({
        recommendationSessions: 10,
        resolvedWithoutTicketSessions: 2,
        continuedToTicketSessions: 8,
      });
      interactionRepository.getTopOpenedFaqs.mockResolvedValue([]);
      interactionRepository.getTopResolvedFaqs.mockResolvedValue([]);
      interactionRepository.getSubCategoryStats.mockResolvedValue([{
        subCategoryId,
        subCategoryName: 'Email',
        categoryName: 'Software',
        recommendationSessions: 4,
        resolvedWithoutTicketSessions: 1,
      }]);

      const result = await service.getAnalytics({ range: '30d' });
      expect(result.subCategoryStats[0]).toEqual(expect.objectContaining({
        subCategoryId,
        subCategoryName: 'Email',
        categoryName: 'Software',
        deflectionRate: 25,
      }));
      expect(result).not.toHaveProperty('categoryStats');
    });
  });

  describe('cleanupOldInteractions', () => {
    it('deletes interactions older than 180 days', async () => {
      (interactionRepository.deleteOlderThan as jest.Mock).mockResolvedValue(5);
      const loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

      await service.cleanupOldInteractions();

      expect(interactionRepository.deleteOlderThan).toHaveBeenCalledWith(expect.any(Date));
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Deleted 5'));
      loggerSpy.mockRestore();
    });

    it('deletes interactions older than 180 days without throwing on repository failure', async () => {
      (interactionRepository.deleteOlderThan as jest.Mock).mockRejectedValue(new Error('database unavailable'));
      await expect(service.cleanupOldInteractions()).resolves.toBeUndefined();
    });
  });
});
