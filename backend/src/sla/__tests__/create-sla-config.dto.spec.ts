import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSlaConfigDto } from '../dto/create-sla-config.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(CreateSlaConfigDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('CreateSlaConfigDto', () => {
  const validData = {
    categoryId: '550e8400-e29b-41d4-a716-446655440000',
    priority: 'High',
    responseTimeMinutes: 60,
    resolutionTimeMinutes: 480,
  };

  it('should pass with valid data', async () => {
    const errors = await validateDto(validData);
    expect(errors).toHaveLength(0);
  });

  it('should reject non-UUID categoryId', async () => {
    const errors = await validateDto({ ...validData, categoryId: 'not-a-uuid' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isUuid');
  });

  it('should reject missing categoryId', async () => {
    const errors = await validateDto({ ...validData, categoryId: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept all valid priority values', async () => {
    for (const priority of ['Low', 'Medium', 'High', 'Critical']) {
      const errors = await validateDto({ ...validData, priority });
      expect(errors).toHaveLength(0);
    }
  });

  it('should reject invalid priority', async () => {
    const errors = await validateDto({ ...validData, priority: 'Urgent' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isEnum');
  });

  it('should reject missing priority', async () => {
    const errors = await validateDto({ ...validData, priority: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject responseTimeMinutes less than 1', async () => {
    const errors = await validateDto({ ...validData, responseTimeMinutes: 0 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('should reject non-integer responseTimeMinutes', async () => {
    const errors = await validateDto({ ...validData, responseTimeMinutes: 30.5 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isInt');
  });

  it('should reject non-integer resolutionTimeMinutes', async () => {
    const errors = await validateDto({ ...validData, resolutionTimeMinutes: 240.7 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isInt');
  });

  it('should reject resolutionTimeMinutes less than 1', async () => {
    const errors = await validateDto({ ...validData, resolutionTimeMinutes: 0 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('should reject missing responseTimeMinutes', async () => {
    const errors = await validateDto({ ...validData, responseTimeMinutes: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ ...validData, extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
