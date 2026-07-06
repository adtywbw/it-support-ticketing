import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from '../dto/create-user.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(CreateUserDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('CreateUserDto', () => {
  const validData = {
    email: 'user@example.com',
    password: 'Password123!',
    name: 'John Doe',
  };

  it('should pass with valid data', async () => {
    const errors = await validateDto(validData);
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid email', async () => {
    const errors = await validateDto({ ...validData, email: 'not-an-email' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isEmail');
  });

  it('should reject missing email', async () => {
    const errors = await validateDto({ ...validData, email: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject email longer than 255 characters', async () => {
    const errors = await validateDto({ ...validData, email: 'a'.repeat(256) + '@b.com' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('should reject password shorter than 8 characters', async () => {
    const errors = await validateDto({ ...validData, password: 'Ab1!' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('minLength');
  });

  it('should reject password longer than 128 characters', async () => {
    const errors = await validateDto({ ...validData, password: 'A'.repeat(129) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('should reject missing password', async () => {
    const errors = await validateDto({ ...validData, password: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should trim name before validation', async () => {
    const errors = await validateDto({ ...validData, name: '  John Doe  ' });
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

  it('should accept valid role enum', async () => {
    const errors = await validateDto({ ...validData, role: 'Admin' });
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid role value', async () => {
    const errors = await validateDto({ ...validData, role: 'SuperAdmin' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept missing optional role', async () => {
    const errors = await validateDto(validData);
    expect(errors).toHaveLength(0);
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ ...validData, extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
