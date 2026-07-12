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
    'findActiveOrdered' | 'findAll' | 'findById' | 'create' | 'update' | 'delete' | 'findActiveForRecommendations'
  >>;
  let subCategoryRepository: jest.Mocked<Pick<SubCategoryRepository, 'findById'>>;
  let interactionRepository: jest.Mocked<Pick<FaqInteractionRepository, 'create' | 'deleteOlderThan' | 'getSummary' | 'getTopOpenedFaqs' | 'getTopResolvedFaqs' | 'getCategoryStats'>>;

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
    };
    subCategoryRepository = {
      findById: jest.fn(),
    };
    interactionRepository = {
      create: jest.fn(),
      deleteOlderThan: jest.fn(),
      getSummary: jest.fn(),
      getTopOpenedFaqs: jest.fn(),
      getTopResolvedFaqs: jest.fn(),
      getCategoryStats: jest.fn(),
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
    it('ranks sub-category, question, keyword, and answer matches deterministically', async () => {
      subCategoryRepository.findById.mockResolvedValue({ id: subCategoryId } as any);
      repo.findActiveForRecommendations.mockResolvedValue([
        { id: 'category', question: 'General setup', answer: 'Steps', subCategoryId, keywords: [], displayOrder: 3, showOnLogin: false, updatedAt: new Date('2026-01-01') },
        { id: 'question', question: 'Reset Wi-Fi adapter', answer: 'Steps', subCategoryId, keywords: [], displayOrder: 1, showOnLogin: false, updatedAt: new Date('2026-01-01') },
        { id: 'keyword', question: 'Network guide', answer: 'Steps', subCategoryId: 'other-sc', keywords: ['wi-fi'], displayOrder: 2, showOnLogin: false, updatedAt: new Date('2026-01-01') },
      ]);

      const result = await service.getRecommendations({ subCategoryId, query: 'wi-fi' });

      expect(result.map((r) => r.id)).toEqual(['question', 'category', 'keyword']);
      expect(result.every((r) => !('keywords' in r))).toBe(true);
    });

    it('rejects a request without subCategoryId or query', async () => {
      await expect(service.getRecommendations({})).rejects.toThrow(BadRequestException);
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
    it('records an article event with the authenticated user', async () => {
      (repo.findById as jest.Mock).mockResolvedValue({ id: faqId });
      (subCategoryRepository.findById as jest.Mock).mockResolvedValue({ id: subCategoryId });
      (interactionRepository.create as jest.Mock).mockResolvedValue({ id: interactionId });

      await service.recordInteraction({ sessionId, faqId, subCategoryId, eventType: FaqInteractionType.ArticleOpened }, userId);

      expect(interactionRepository.create).toHaveBeenCalledWith({
        sessionId,
        userId,
        faqId,
        subCategoryId,
        eventType: FaqInteractionType.ArticleOpened,
      });
    });

    it('throws NotFoundException when faq does not exist', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(null);
      (subCategoryRepository.findById as jest.Mock).mockResolvedValue({ id: subCategoryId });

      await expect(service.recordInteraction({ sessionId, faqId, subCategoryId, eventType: FaqInteractionType.ArticleOpened }, userId)).rejects.toThrow(NotFoundException);
      expect(interactionRepository.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when subCategory does not exist', async () => {
      (subCategoryRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.recordInteraction({ sessionId, subCategoryId, eventType: FaqInteractionType.RecommendationsShown }, userId)).rejects.toThrow(NotFoundException);
      expect(interactionRepository.create).not.toHaveBeenCalled();
    });

    it('records RecommendationsShown without faqId', async () => {
      (subCategoryRepository.findById as jest.Mock).mockResolvedValue({ id: subCategoryId });
      (interactionRepository.create as jest.Mock).mockResolvedValue({ id: interactionId });

      await service.recordInteraction({ sessionId, subCategoryId, eventType: FaqInteractionType.RecommendationsShown }, userId);

      expect(interactionRepository.create).toHaveBeenCalledWith({
        sessionId,
        userId,
        faqId: undefined,
        subCategoryId,
        eventType: FaqInteractionType.RecommendationsShown,
      });
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
      interactionRepository.getCategoryStats.mockResolvedValue([]);

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
      interactionRepository.getCategoryStats.mockResolvedValue([]);

      const result = await service.getAnalytics({ range: '30d' });
      expect(result.deflectionRate).toBe(33.3);
      expect(result.continuedToTicketRate).toBe(66.7);
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
