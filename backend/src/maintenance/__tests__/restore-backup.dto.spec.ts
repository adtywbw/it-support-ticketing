import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RestoreBackupDto } from '../dto/restore-backup.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(RestoreBackupDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('RestoreBackupDto', () => {
  it('should pass with valid confirmation string', async () => {
    const errors = await validateDto({ confirmation: 'restore' });
    expect(errors).toHaveLength(0);
  });

  it('should trim confirmation before validation', async () => {
    const errors = await validateDto({ confirmation: '  restore  ' });
    expect(errors).toHaveLength(0);
  });

  it('should reject whitespace-only confirmation', async () => {
    const errors = await validateDto({ confirmation: '   ' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should reject missing confirmation', async () => {
    const errors = await validateDto({ confirmation: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject non-string confirmation', async () => {
    const errors = await validateDto({ confirmation: 123 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject empty confirmation', async () => {
    const errors = await validateDto({ confirmation: '' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ confirmation: 'restore', extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
