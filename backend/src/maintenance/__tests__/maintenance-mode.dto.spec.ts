import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MaintenanceModeDto } from '../dto/maintenance-mode.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(MaintenanceModeDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('MaintenanceModeDto', () => {
  it('should pass with valid enabled boolean and no message', async () => {
    const errors = await validateDto({ enabled: true });
    expect(errors).toHaveLength(0);
  });

  it('should pass with enabled false', async () => {
    const errors = await validateDto({ enabled: false });
    expect(errors).toHaveLength(0);
  });

  it('should reject non-boolean enabled', async () => {
    const errors = await validateDto({ enabled: 'yes' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing enabled', async () => {
    const errors = await validateDto({ enabled: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should pass with valid message', async () => {
    const errors = await validateDto({ enabled: true, message: 'Scheduled maintenance' });
    expect(errors).toHaveLength(0);
  });

  it('should reject empty message string', async () => {
    const errors = await validateDto({ enabled: true, message: '' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should reject message longer than 1000 characters', async () => {
    const errors = await validateDto({ enabled: true, message: 'a'.repeat(1001) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('should reject non-string message', async () => {
    const errors = await validateDto({ enabled: true, message: 123 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ enabled: true, extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
