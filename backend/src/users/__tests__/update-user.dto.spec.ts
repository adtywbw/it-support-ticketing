import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserDto } from '../dto/update-user.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(UpdateUserDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('UpdateUserDto', () => {
  it('should pass with empty data (all optional)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('should pass with valid email', async () => {
    const errors = await validateDto({ email: 'user@example.com' });
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid email', async () => {
    const errors = await validateDto({ email: 'not-an-email' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isEmail');
  });

  it('should reject password shorter than 8 characters', async () => {
    const errors = await validateDto({ password: 'Ab1!' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('minLength');
  });

  it('should trim name before validation', async () => {
    const errors = await validateDto({ name: '  John Doe  ' });
    expect(errors).toHaveLength(0);
  });

  it('should reject whitespace-only name', async () => {
    const errors = await validateDto({ name: '   ' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should accept valid role enum', async () => {
    const errors = await validateDto({ role: 'ITSupport' });
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid role value', async () => {
    const errors = await validateDto({ role: 'SuperAdmin' });
    expect(errors.length).toBeGreaterThan(0);
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
    const errors = await validateDto({ name: 'John', extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
