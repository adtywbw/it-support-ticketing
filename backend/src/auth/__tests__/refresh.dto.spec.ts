import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RefreshDto } from '../dto/refresh.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(RefreshDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('RefreshDto', () => {
  it('should pass with valid refresh token', async () => {
    const errors = await validateDto({ refreshToken: 'some-refresh-token' });
    expect(errors).toHaveLength(0);
  });

  it('should reject missing refreshToken', async () => {
    const errors = await validateDto({ refreshToken: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject non-string refreshToken', async () => {
    const errors = await validateDto({ refreshToken: 12345 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ refreshToken: 'token', extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
