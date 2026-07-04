import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFaqDto } from '../dto/create-faq.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(CreateFaqDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('CreateFaqDto', () => {
  const validData = {
    question: 'How do I reset my password?',
    answer: 'Contact Admin or ITSupport to request a password reset.',
  };

  it('should pass with valid data', async () => {
    const errors = await validateDto(validData);
    expect(errors).toHaveLength(0);
  });

  it('should leave displayOrder and isActive undefined when not provided', async () => {
    const dto = plainToInstance(CreateFaqDto, validData);
    expect(dto.displayOrder).toBeUndefined();
    expect(dto.isActive).toBeUndefined();
  });

  it('should trim question before validation', async () => {
    const errors = await validateDto({ ...validData, question: '  Valid question  ' });
    expect(errors).toHaveLength(0);
  });

  it('should trim answer before validation', async () => {
    const errors = await validateDto({ ...validData, answer: '  Valid answer  ' });
    expect(errors).toHaveLength(0);
  });

  it('should reject whitespace-only question', async () => {
    const errors = await validateDto({ ...validData, question: '   ' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should reject whitespace-only answer', async () => {
    const errors = await validateDto({ ...validData, answer: '   ' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should reject missing question', async () => {
    const errors = await validateDto({ ...validData, question: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing answer', async () => {
    const errors = await validateDto({ ...validData, answer: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject question longer than 255 characters', async () => {
    const errors = await validateDto({ ...validData, question: 'a'.repeat(256) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('should reject answer longer than 5000 characters', async () => {
    const errors = await validateDto({ ...validData, answer: 'a'.repeat(5001) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('should reject non-integer displayOrder', async () => {
    const errors = await validateDto({ ...validData, displayOrder: 1.5 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isInt');
  });

  it('should reject negative displayOrder', async () => {
    const errors = await validateDto({ ...validData, displayOrder: -1 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('should reject non-boolean isActive', async () => {
    const errors = await validateDto({ ...validData, isActive: 'yes' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown fields (forbidNonWhitelisted)', async () => {
    const errors = await validateDto({ ...validData, extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('whitelistValidation');
  });
});
