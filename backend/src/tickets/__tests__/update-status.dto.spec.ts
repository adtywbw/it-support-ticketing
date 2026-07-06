import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateStatusDto } from '../dto/update-status.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(UpdateStatusDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('UpdateStatusDto', () => {
  it('should pass with valid status', async () => {
    const errors = await validateDto({ status: 'Open' });
    expect(errors).toHaveLength(0);
  });

  it('should accept all valid status values', async () => {
    for (const status of ['Open', 'InProgress', 'OnHold', 'Resolved', 'Closed']) {
      const errors = await validateDto({ status });
      expect(errors).toHaveLength(0);
    }
  });

  it('should reject invalid status', async () => {
    const errors = await validateDto({ status: 'InvalidStatus' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isEnum');
  });

  it('should reject missing status', async () => {
    const errors = await validateDto({ status: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject non-string status', async () => {
    const errors = await validateDto({ status: 123 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ status: 'Open', extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
