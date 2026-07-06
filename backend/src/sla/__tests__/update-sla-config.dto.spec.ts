import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSlaConfigDto } from '../dto/update-sla-config.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(UpdateSlaConfigDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('UpdateSlaConfigDto', () => {
  it('should pass with empty data (all optional)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('should pass with valid responseTimeMinutes', async () => {
    const errors = await validateDto({ responseTimeMinutes: 60 });
    expect(errors).toHaveLength(0);
  });

  it('should reject responseTimeMinutes less than 1', async () => {
    const errors = await validateDto({ responseTimeMinutes: 0 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('should reject non-integer responseTimeMinutes', async () => {
    const errors = await validateDto({ responseTimeMinutes: 30.5 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isInt');
  });

  it('should reject resolutionTimeMinutes less than 1', async () => {
    const errors = await validateDto({ resolutionTimeMinutes: 0 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('should reject non-integer resolutionTimeMinutes', async () => {
    const errors = await validateDto({ resolutionTimeMinutes: 240.7 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isInt');
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
    const errors = await validateDto({ responseTimeMinutes: 60, extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
