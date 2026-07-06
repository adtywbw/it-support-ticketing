import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSubCategoryDto } from '../dto/create-sub-category.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(CreateSubCategoryDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('CreateSubCategoryDto', () => {
  const validData = {
    name: 'VPN Issues',
  };

  it('should pass with valid data', async () => {
    const errors = await validateDto(validData);
    expect(errors).toHaveLength(0);
  });

  it('should trim name before validation', async () => {
    const errors = await validateDto({ ...validData, name: '  VPN Issues  ' });
    expect(errors).toHaveLength(0);
  });

  it('should reject whitespace-only name', async () => {
    const errors = await validateDto({ ...validData, name: '   ' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should reject name longer than 255 characters', async () => {
    const errors = await validateDto({ ...validData, name: 'a'.repeat(256) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('should reject missing name', async () => {
    const errors = await validateDto({ ...validData, name: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject non-string name', async () => {
    const errors = await validateDto({ ...validData, name: 123 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept optional description', async () => {
    const errors = await validateDto({ ...validData, description: 'VPN connectivity problems' });
    expect(errors).toHaveLength(0);
  });

  it('should trim whitespace-only description to undefined', async () => {
    const errors = await validateDto({ ...validData, description: '   ' });
    expect(errors).toHaveLength(0);
  });

  it('should reject description longer than 1000 characters', async () => {
    const errors = await validateDto({ ...validData, description: 'a'.repeat(1001) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ ...validData, extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
