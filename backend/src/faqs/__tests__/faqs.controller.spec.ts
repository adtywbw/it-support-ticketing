import { FaqsController } from '../faqs.controller';
import { FaqsService } from '../faqs.service';
import { FaqInteractionType } from '@prisma/client';

describe('FaqsController', () => {
  let controller: FaqsController;
  let service: jest.Mocked<Pick<FaqsService, 'findActiveOrdered' | 'findAll' | 'create' | 'update' | 'remove' | 'getRecommendations' | 'recordInteraction'>>;

  beforeEach(() => {
    service = {
      findActiveOrdered: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      getRecommendations: jest.fn(),
      recordInteraction: jest.fn(),
    };
    controller = new FaqsController(service as any);
  });

  const faq = { id: 'a', question: 'Q', answer: 'A', displayOrder: 0, isActive: true, categoryId: null, category: null, keywords: [], createdAt: new Date(), updatedAt: new Date() };

  it('findAllPublic delegates to service.findActiveOrdered', async () => {
    service.findActiveOrdered.mockResolvedValue([faq]);
    await expect(controller.findAllPublic()).resolves.toEqual([faq]);
    expect(service.findActiveOrdered).toHaveBeenCalled();
  });

  it('findAllAdmin delegates to service.findAll', async () => {
    service.findAll.mockResolvedValue([faq]);
    await expect(controller.findAllAdmin()).resolves.toEqual([faq]);
  });

  it('create delegates to service.create', async () => {
    service.create.mockResolvedValue(faq);
    await expect(controller.create({ question: 'Q', answer: 'A' } as any)).resolves.toEqual(faq);
  });

  it('update delegates to service.update', async () => {
    service.update.mockResolvedValue({ ...faq, question: 'X' });
    await expect(controller.update('a', { question: 'X' } as any)).resolves.toMatchObject({ question: 'X' });
  });

  it('remove delegates to service.remove and returns message', async () => {
    service.remove.mockResolvedValue(undefined);
    await expect(controller.remove('a')).resolves.toEqual({ message: 'FAQ deleted successfully' });
    expect(service.remove).toHaveBeenCalledWith('a');
  });

  it('getRecommendations delegates to service.getRecommendations', async () => {
    const dto = { categoryId: 'uuid', query: 'wi-fi' };
    service.getRecommendations.mockResolvedValue([]);
    await expect(controller.getRecommendations(dto as any)).resolves.toEqual([]);
    expect(service.getRecommendations).toHaveBeenCalledWith(dto);
  });

  it('recordInteraction delegates to service.recordInteraction and returns recorded response', async () => {
    const dto = { sessionId: 'session-uuid', eventType: FaqInteractionType.RecommendationsShown };
    service.recordInteraction.mockResolvedValue(undefined);

    const result = await controller.recordInteraction(dto as any, 'user-uuid');

    expect(service.recordInteraction).toHaveBeenCalledWith(dto, 'user-uuid');
    expect(result).toEqual({ recorded: true });
  });
});
