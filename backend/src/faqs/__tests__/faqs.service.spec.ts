import { NotFoundException } from '@nestjs/common';
import { FaqsService } from '../faqs.service';
import { FaqRepository } from '../../common/repositories/faq.repository';

describe('FaqsService', () => {
  let service: FaqsService;
  let repo: jest.Mocked<Pick<
    FaqRepository,
    'findActiveOrdered' | 'findAll' | 'findById' | 'create' | 'update' | 'delete'
  >>;

  beforeEach(() => {
    repo = {
      findActiveOrdered: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    service = new FaqsService(repo as any);
  });

  const faq = { id: 'a', question: 'Q', answer: 'A', displayOrder: 0, isActive: true, categoryId: null, keywords: [], createdAt: new Date(), updatedAt: new Date() };

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
      expect(repo.create).toHaveBeenCalledWith({ question: 'Q', answer: 'A', displayOrder: 0, isActive: true });
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
