import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateNotificationPreferencesDto } from '../dto/update-notification-preferences.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(UpdateNotificationPreferencesDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('UpdateNotificationPreferencesDto', () => {
  it('should pass with valid preferences object', async () => {
    const errors = await validateDto({
      preferences: { ticket_created: true, ticket_assigned: false },
    });
    expect(errors).toHaveLength(0);
  });

  it('should convert non-object preferences to empty object via transform', async () => {
    const dto = plainToInstance(UpdateNotificationPreferencesDto, { preferences: 'not-an-object' });
    expect(dto.preferences).toEqual({});
  });

  it('should convert null preferences to empty object via transform', async () => {
    const dto = plainToInstance(UpdateNotificationPreferencesDto, { preferences: null });
    expect(dto.preferences).toEqual({});
  });

  it('should convert array preferences to empty object via transform', async () => {
    const dto = plainToInstance(UpdateNotificationPreferencesDto, { preferences: ['a', 'b'] });
    expect(dto.preferences).toEqual({});
  });

  it('should convert undefined preferences to empty object via transform', async () => {
    const dto = plainToInstance(UpdateNotificationPreferencesDto, { preferences: undefined });
    expect(dto.preferences).toEqual({});
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ preferences: { a: true }, extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
