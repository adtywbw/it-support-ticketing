import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FaqsService } from '../faqs.service';
import { FaqRepository } from '../../common/repositories/faq.repository';
import { CategoryRepository } from '../../common/repositories/category.repository';

describe('FaqsService', () => {
  let service: FaqsService;
  let repo: jest.Mocked<Pick<
    FaqRepository,
    'findActiveOrdered' | 'findAll' | 'findById' | 'create' | 'update' | 'delete' | 'findActiveForRecommendations'
  >>;
  let categoryRepository: jest.Mocked<Pick<CategoryRepository, 'findById'>>;

  const categoryId = 'cat-uuid';
  const faqId = 'faq-uuid';

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
    categoryRepository = {
      findById: jest.fn(),
    };
    service = new FaqsService(repo as any, categoryRepository as any);
  });

  const faq = { id: 'a', question: 'Q', answer: 'A', displayOrder: 0, isActive: true, categoryId: null, category: null, keywords: [], createdAt: new Date(), updatedAt: new Date() };

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
      repo.create.mockResolvedValue(faq);
      await expect(service.create({ question: 'Q', answer: 'A' } as any)).resolves.toEqual(faq);
      expect(repo.create).toHaveBeenCalledWith({ question: 'Q', answer: 'A', displayOrder: 0, isActive: true, keywords: [], category: undefined });
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
    it('creates FAQ metadata with a category relation', async () => {
      categoryRepository.findById.mockResolvedValue({ id: categoryId } as any);
      repo.create.mockResolvedValue({ id: faqId } as any);

      await service.create({
        question: 'Reset Wi-Fi',
        answer: 'Restart the adapter.',
        categoryId,
        keywords: ['wi-fi'],
      });

      expect(repo.create).toHaveBeenCalledWith({
        question: 'Reset Wi-Fi',
        answer: 'Restart the adapter.',
        displayOrder: 0,
        isActive: true,
        keywords: ['wi-fi'],
        category: { connect: { id: categoryId } },
      });
    });
  });

  describe('update with metadata', () => {
    it('disconnects the category when categoryId is null', async () => {
      repo.findById.mockResolvedValue({ id: faqId } as any);
      repo.update.mockResolvedValue({ id: faqId } as any);

      await service.update(faqId, { categoryId: null });

      expect(repo.update).toHaveBeenCalledWith(faqId, {
        category: { disconnect: true },
      });
    });
  });

  describe('getRecommendations', () => {
    it('ranks category, question, keyword, and answer matches deterministically', async () => {
      categoryRepository.findById.mockResolvedValue({ id: categoryId } as any);
      repo.findActiveForRecommendations.mockResolvedValue([
        { id: 'category', question: 'General setup', answer: 'Steps', categoryId, keywords: [], displayOrder: 3, updatedAt: new Date('2026-01-01') },
        { id: 'question', question: 'Reset Wi-Fi adapter', answer: 'Steps', categoryId: null, keywords: [], displayOrder: 1, updatedAt: new Date('2026-01-01') },
        { id: 'keyword', question: 'Network guide', answer: 'Steps', categoryId: null, keywords: ['wi-fi'], displayOrder: 2, updatedAt: new Date('2026-01-01') },
      ]);

      const result = await service.getRecommendations({ categoryId, query: 'wi-fi' });

      expect(result.map((faq) => faq.id)).toEqual(['category', 'question', 'keyword']);
      expect(result.every((faq) => !('keywords' in faq))).toBe(true);
    });

    it('rejects a request without category or query', async () => {
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
});
