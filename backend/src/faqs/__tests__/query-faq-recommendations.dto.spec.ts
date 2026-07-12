import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { QueryFaqRecommendationsDto } from '../dto/query-faq-recommendations.dto';

describe('QueryFaqRecommendationsDto', () => {
  it('accepts a valid UUID and query', async () => {
    const dto = plainToInstance(QueryFaqRecommendationsDto, {
      subCategoryId: '550e8400-e29b-41d4-a716-446655440000',
      query: 'reset wi-fi',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts subCategoryId alone', async () => {
    const dto = plainToInstance(QueryFaqRecommendationsDto, {
      subCategoryId: '550e8400-e29b-41d4-a716-446655440000',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts query alone', async () => {
    const dto = plainToInstance(QueryFaqRecommendationsDto, { query: 'reset wi-fi' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid UUID for subCategoryId', async () => {
    const dto = plainToInstance(QueryFaqRecommendationsDto, {
      subCategoryId: 'not-a-uuid',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('subCategoryId');
  });

  it('rejects a query shorter than 3 characters', async () => {
    const dto = plainToInstance(QueryFaqRecommendationsDto, { query: 'ab' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('query');
  });

  it('rejects a query longer than 255 characters', async () => {
    const dto = plainToInstance(QueryFaqRecommendationsDto, {
      query: 'a'.repeat(256),
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('query');
  });
});
