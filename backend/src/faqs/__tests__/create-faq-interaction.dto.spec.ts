import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFaqInteractionDto, CLIENT_FAQ_INTERACTION_TYPES } from '../dto/create-faq-interaction.dto';
import { FaqInteractionType } from '@prisma/client';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(CreateFaqInteractionDto, data) as object;
  return await validate(dto);
}

const sessionId = 'a1b2c3d4-e5f6-4a78-bcde-ef1234567890';
const faqId = 'b2c3d4e5-f6a7-4a01-9cde-f12345678901';
const clientTypes = [...CLIENT_FAQ_INTERACTION_TYPES];

describe('CreateFaqInteractionDto', () => {
  it('accepts RecommendationsShown without faqId', async () => {
    const errors = await validateDto({ sessionId, eventType: FaqInteractionType.RecommendationsShown });
    expect(errors).toHaveLength(0);
  });

  it('accepts ArticleOpened with faqId', async () => {
    const errors = await validateDto({ sessionId, eventType: FaqInteractionType.ArticleOpened, faqId });
    expect(errors).toHaveLength(0);
  });

  it('accepts ProblemResolved with faqId', async () => {
    const errors = await validateDto({ sessionId, eventType: FaqInteractionType.ProblemResolved, faqId });
    expect(errors).toHaveLength(0);
  });

  it.each(['ArticleOpened', 'ProblemResolved'])('requires faqId for %s', async (eventType) => {
    const errors = await validateDto({ sessionId, eventType });
    expect(errors).not.toHaveLength(0);
  });

  it('rejects client-submitted TicketCreated', async () => {
    const errors = await validateDto({ sessionId, eventType: FaqInteractionType.TicketCreated });
    expect(errors).not.toHaveLength(0);
  });

  it('rejects invalid sessionId', async () => {
    const errors = await validateDto({ sessionId: 'not-a-uuid', eventType: 'ArticleOpened', faqId });
    expect(errors).not.toHaveLength(0);
  });

  it('rejects invalid faqId', async () => {
    const errors = await validateDto({ sessionId, eventType: 'ArticleOpened', faqId: 'bad' });
    expect(errors).not.toHaveLength(0);
  });

  it('rejects invalid eventType', async () => {
    const errors = await validateDto({ sessionId, eventType: 'UnknownEvent' });
    expect(errors).not.toHaveLength(0);
  });

  it('accepts optional categoryId', async () => {
    const categoryId = 'c3d4e5f6-a7b8-4012-9cde-f12345678901';
    const errors = await validateDto({ sessionId, eventType: FaqInteractionType.RecommendationsShown, categoryId });
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid categoryId', async () => {
    const errors = await validateDto({ sessionId, eventType: FaqInteractionType.RecommendationsShown, categoryId: 'bad' });
    expect(errors).not.toHaveLength(0);
  });
});
