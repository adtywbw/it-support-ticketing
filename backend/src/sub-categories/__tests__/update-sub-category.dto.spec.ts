import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSubCategoryDto } from '../dto/update-sub-category.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(UpdateSubCategoryDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('UpdateSubCategoryDto', () => {
  it('should pass with empty data (all optional)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('should pass with valid name', async () => {
    const errors = await validateDto({ name: 'VPN Issues' });
    expect(errors).toHaveLength(0);
  });

  it('should reject whitespace-only name', async () => {
    const errors = await validateDto({ name: '   ' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should trim name before validation', async () => {
    const errors = await validateDto({ name: '  VPN Issues  ' });
    expect(errors).toHaveLength(0);
  });

  it('should reject name longer than 255 characters', async () => {
    const errors = await validateDto({ name: 'a'.repeat(256) });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid description', async () => {
    const errors = await validateDto({ description: 'VPN connectivity' });
    expect(errors).toHaveLength(0);
  });

  it('should trim whitespace-only description to undefined', async () => {
    const errors = await validateDto({ description: '   ' });
    expect(errors).toHaveLength(0);
  });

  it('should accept empty description (trimOptionalString converts to undefined)', async () => {
    const errors = await validateDto({ description: '' });
    expect(errors).toHaveLength(0);
  });

  it('should accept valid isActive boolean', async () => {
    const errors = await validateDto({ isActive: false });
    expect(errors).toHaveLength(0);
  });

  it('should reject non-boolean isActive', async () => {
    const errors = await validateDto({ isActive: 'yes' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ name: 'VPN', extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
