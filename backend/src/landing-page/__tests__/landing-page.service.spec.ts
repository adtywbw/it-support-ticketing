import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LandingPageService } from '../landing-page.service';
import { LandingPageConfigRepository } from '../../common/repositories/landing-page-config.repository';

describe('LandingPageService', () => {
  let service: LandingPageService;
  let repository: any;

  const mockRepository = {
    findOrCreate: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LandingPageService,
        { provide: LandingPageConfigRepository, useValue: mockRepository },
      ],
    }).compile();

    service = module.get<LandingPageService>(LandingPageService);
    repository = module.get(LandingPageConfigRepository);
    jest.resetAllMocks();
  });

  describe('getPublicContent()', () => {
    it('should return contact and active FAQs sorted by order', async () => {
      const config = {
        id: '1',
        key: 'default',
        contact: { email: 'it@company.com', phone: '123', hours: '9-5', location: 'Office' },
        faqs: [
          { id: 'a', question: 'Q2', answer: 'A2', order: 1, active: true },
          { id: 'b', question: 'Q1', answer: 'A1', order: 0, active: true },
          { id: 'c', question: 'Q3', answer: 'A3', order: 2, active: false },
        ],
      };
      repository.findOrCreate.mockResolvedValueOnce(config);

      const result = await service.getPublicContent();

      expect(result.contact).toEqual(config.contact);
      expect(result.faqs).toHaveLength(2);
      expect(result.faqs[0].id).toBe('b');
      expect(result.faqs[1].id).toBe('a');
      expect(result.faqs.find((f: any) => f.id === 'c')).toBeUndefined();
    });

    it('should return defaults when no row exists', async () => {
      repository.findOrCreate.mockResolvedValueOnce({
        id: '1',
        key: 'default',
        contact: { email: '', phone: '', hours: '', location: '' },
        faqs: [],
      });

      const result = await service.getPublicContent();

      expect(result.contact).toEqual({ email: '', phone: '', hours: '', location: '' });
      expect(result.faqs).toEqual([]);
    });
  });

  describe('getContent() (admin)', () => {
    it('should return all FAQs including inactive, sorted by order', async () => {
      const config = {
        id: '1',
        key: 'default',
        contact: { email: 'it@company.com', phone: '', hours: '', location: '' },
        faqs: [
          { id: 'a', question: 'Q2', answer: 'A2', order: 1, active: false },
          { id: 'b', question: 'Q1', answer: 'A1', order: 0, active: true },
        ],
      };
      repository.findOrCreate.mockResolvedValueOnce(config);

      const result = await service.getContent();

      expect(result.faqs).toHaveLength(2);
      expect(result.faqs[0].id).toBe('b');
      expect(result.faqs[1].id).toBe('a');
    });
  });

  describe('updateContent()', () => {
    const existingConfig = {
      id: '1',
      key: 'default',
      contact: { email: 'old@company.com', phone: '111', hours: '9-5', location: 'Office' },
      faqs: [{ id: 'existing', question: 'Old Q', answer: 'Old A', order: 0, active: true }],
    };

    it('should merge contact onto existing, preserving faqs', async () => {
      repository.findOrCreate.mockResolvedValueOnce(existingConfig);
      repository.update.mockResolvedValueOnce({ ...existingConfig, contact: { email: 'new@company.com', phone: '111', hours: '9-5', location: 'Office' } });

      await service.updateContent({ contact: { email: 'new@company.com' } });

      expect(repository.update).toHaveBeenCalledWith({
        contact: { email: 'new@company.com', phone: '111', hours: '9-5', location: 'Office' },
        faqs: existingConfig.faqs,
      });
    });

    it('should replace faqs array, preserving contact', async () => {
      repository.findOrCreate.mockResolvedValueOnce(existingConfig);
      repository.update.mockResolvedValueOnce({ ...existingConfig, faqs: [] });

      const newFaqs = [
        { question: 'New Q', answer: 'New A', order: 1, active: true },
        { question: 'Q2', answer: 'A2', order: 0, active: true },
      ];

      await service.updateContent({ faqs: newFaqs as any });

      expect(repository.update).toHaveBeenCalledWith({
        contact: existingConfig.contact,
        faqs: expect.arrayContaining([
          expect.objectContaining({ question: 'Q2', answer: 'A2', order: 0 }),
          expect.objectContaining({ question: 'New Q', answer: 'New A', order: 1 }),
        ]),
      });
    });

    it('should generate UUID id for faq entries missing one', async () => {
      repository.findOrCreate.mockResolvedValueOnce({ ...existingConfig, faqs: [] });
      repository.update.mockResolvedValueOnce({ ...existingConfig, faqs: [] });

      await service.updateContent({
        faqs: [{ question: 'Q', answer: 'A', order: 0, active: true }],
      } as any);

      const updateCall = repository.update.mock.calls[0][0];
      expect(updateCall.faqs[0].id).toBeDefined();
      expect(typeof updateCall.faqs[0].id).toBe('string');
      expect(updateCall.faqs[0].id.length).toBeGreaterThan(0);
    });

    it('should preserve existing id when provided', async () => {
      repository.findOrCreate.mockResolvedValueOnce({ ...existingConfig, faqs: [] });
      repository.update.mockResolvedValueOnce({ ...existingConfig, faqs: [] });

      await service.updateContent({
        faqs: [{ id: 'my-id', question: 'Q', answer: 'A', order: 0, active: true }],
      } as any);

      const updateCall = repository.update.mock.calls[0][0];
      expect(updateCall.faqs[0].id).toBe('my-id');
    });

    it('should sort faqs by order before storing', async () => {
      repository.findOrCreate.mockResolvedValueOnce({ ...existingConfig, faqs: [] });
      repository.update.mockResolvedValueOnce({ ...existingConfig, faqs: [] });

      await service.updateContent({
        faqs: [
          { id: 'a', question: 'Q1', answer: 'A1', order: 2, active: true },
          { id: 'b', question: 'Q2', answer: 'A2', order: 0, active: true },
          { id: 'c', question: 'Q3', answer: 'A3', order: 1, active: true },
        ],
      } as any);

      const updateCall = repository.update.mock.calls[0][0];
      expect(updateCall.faqs.map((f: any) => f.id)).toEqual(['b', 'c', 'a']);
    });

    it('should throw BadRequestException on duplicate faq ids', async () => {
      repository.findOrCreate.mockResolvedValueOnce({ ...existingConfig, faqs: [] });

      await expect(
        service.updateContent({
          faqs: [
            { id: 'dup', question: 'Q1', answer: 'A1', order: 0, active: true },
            { id: 'dup', question: 'Q2', answer: 'A2', order: 1, active: true },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update both contact and faqs when both provided', async () => {
      repository.findOrCreate.mockResolvedValueOnce(existingConfig);
      repository.update.mockResolvedValueOnce({ ...existingConfig });

      await service.updateContent({
        contact: { email: 'new@company.com' },
        faqs: [{ question: 'Q', answer: 'A', order: 0, active: true }],
      } as any);

      expect(repository.update).toHaveBeenCalledTimes(1);
      const updateCall = repository.update.mock.calls[0][0];
      expect(updateCall.contact.email).toBe('new@company.com');
      expect(updateCall.faqs).toHaveLength(1);
    });

    it('should return the full admin view after update', async () => {
      repository.findOrCreate.mockResolvedValueOnce(existingConfig);
      const updated = { ...existingConfig, contact: { email: 'new@company.com', phone: '111', hours: '9-5', location: 'Office' } };
      repository.update.mockResolvedValueOnce(updated);
      // updateContent calls this.getContent() which calls findOrCreate() again
      repository.findOrCreate.mockResolvedValueOnce(updated);

      const result = await service.updateContent({ contact: { email: 'new@company.com' } });

      expect(result.contact.email).toBe('new@company.com');
    });
  });
});
