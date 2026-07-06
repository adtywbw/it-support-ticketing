import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from '../dto/change-password.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(ChangePasswordDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('ChangePasswordDto', () => {
  const validData = {
    currentPassword: 'OldPass123!',
    newPassword: 'NewPass123!',
  };

  it('should pass with valid data', async () => {
    const errors = await validateDto(validData);
    expect(errors).toHaveLength(0);
  });

  it('should reject missing currentPassword', async () => {
    const errors = await validateDto({ ...validData, currentPassword: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing newPassword', async () => {
    const errors = await validateDto({ ...validData, newPassword: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject currentPassword shorter than 8 characters', async () => {
    const errors = await validateDto({ ...validData, currentPassword: 'Ab1!' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('minLength');
  });

  it('should reject newPassword shorter than 8 characters', async () => {
    const errors = await validateDto({ ...validData, newPassword: 'Ab1!' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('minLength');
  });

  it('should reject passwords longer than 128 characters', async () => {
    const errors = await validateDto({ ...validData, currentPassword: 'A'.repeat(129) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('should reject non-string currentPassword', async () => {
    const errors = await validateDto({ ...validData, currentPassword: 12345 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ ...validData, extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
