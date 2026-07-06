import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from '../dto/login.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(LoginDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('LoginDto', () => {
  const validData = {
    email: 'test@example.com',
    password: 'Password123!',
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

  it('should reject non-string password', async () => {
    const errors = await validateDto({ ...validData, password: 12345 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing password', async () => {
    const errors = await validateDto({ ...validData, password: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ ...validData, extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
