import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateFaqDto } from '../dto/update-faq.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(UpdateFaqDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('UpdateFaqDto', () => {
  it('should pass with empty data (all optional)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('should pass with valid question', async () => {
    const errors = await validateDto({ question: 'How do I reset my password?' });
    expect(errors).toHaveLength(0);
  });

  it('should trim question before validation', async () => {
    const errors = await validateDto({ question: '  Valid question  ' });
    expect(errors).toHaveLength(0);
  });

  it('should reject whitespace-only question', async () => {
    const errors = await validateDto({ question: '   ' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should reject question longer than 255 characters', async () => {
    const errors = await validateDto({ question: 'a'.repeat(256) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('should trim answer before validation', async () => {
    const errors = await validateDto({ answer: '  Valid answer  ' });
    expect(errors).toHaveLength(0);
  });

  it('should reject whitespace-only answer', async () => {
    const errors = await validateDto({ answer: '   ' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should reject answer longer than 5000 characters', async () => {
    const errors = await validateDto({ answer: 'a'.repeat(5001) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('should accept valid displayOrder', async () => {
    const errors = await validateDto({ displayOrder: 5 });
    expect(errors).toHaveLength(0);
  });

  it('should reject non-integer displayOrder', async () => {
    const errors = await validateDto({ displayOrder: 1.5 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isInt');
  });

  it('should reject negative displayOrder', async () => {
    const errors = await validateDto({ displayOrder: -1 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('should accept valid isActive boolean', async () => {
    const errors = await validateDto({ isActive: true });
    expect(errors).toHaveLength(0);
  });

  it('should reject non-boolean isActive', async () => {
    const errors = await validateDto({ isActive: 'yes' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ question: 'Q?', extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('whitelistValidation');
  });

  it('accepts valid subCategoryId', async () => {
    const errors = await validateDto({ subCategoryId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid subCategoryId', async () => {
    const errors = await validateDto({ subCategoryId: 'bad' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
