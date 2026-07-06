import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTelegramConfigDto, CheckTelegramConfigDto } from '../dto/telegram-config.dto';

async function validateUpdateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(UpdateTelegramConfigDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

async function validateCheckDto(data: Record<string, unknown>) {
  const dto = plainToInstance(CheckTelegramConfigDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('UpdateTelegramConfigDto', () => {
  it('should pass with empty data (all optional)', async () => {
    const errors = await validateUpdateDto({});
    expect(errors).toHaveLength(0);
  });

  it('should pass with valid botToken', async () => {
    const errors = await validateUpdateDto({ botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11' });
    expect(errors).toHaveLength(0);
  });

  it('should reject botToken longer than 256 characters', async () => {
    const errors = await validateUpdateDto({ botToken: 'a'.repeat(257) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('should reject non-string botToken', async () => {
    const errors = await validateUpdateDto({ botToken: 123 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should pass with valid settings (enabledEvents)', async () => {
    const errors = await validateUpdateDto({
      settings: { enabledEvents: ['ticket.created', 'ticket.assigned'] },
    });
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid enabledEvent value', async () => {
    const errors = await validateUpdateDto({
      settings: { enabledEvents: ['invalid.event'] },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject non-array enabledEvents', async () => {
    const errors = await validateUpdateDto({
      settings: { enabledEvents: 'ticket.created' },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid enableGroupChat boolean', async () => {
    const errors = await validateUpdateDto({
      settings: { enableGroupChat: true },
    });
    expect(errors).toHaveLength(0);
  });

  it('should reject non-boolean enableGroupChat', async () => {
    const errors = await validateUpdateDto({
      settings: { enableGroupChat: 'yes' },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject groupChatId longer than 128 characters', async () => {
    const errors = await validateUpdateDto({
      settings: { groupChatId: 'a'.repeat(129) },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid notifyIndividualsWhenGroupChat boolean', async () => {
    const errors = await validateUpdateDto({
      settings: { notifyIndividualsWhenGroupChat: false },
    });
    expect(errors).toHaveLength(0);
  });

  it('should pass with valid templates', async () => {
    const errors = await validateUpdateDto({
      settings: {
        templates: {
          'ticket.created': 'New ticket {ticketNumber}',
        },
      },
    });
    expect(errors).toHaveLength(0);
  });

  it('should reject template longer than 1000 characters', async () => {
    const errors = await validateUpdateDto({
      settings: {
        templates: {
          'ticket.created': 'a'.repeat(1001),
        },
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown fields in settings', async () => {
    const errors = await validateUpdateDto({
      settings: { extra: 'oops' as unknown },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject non-object settings', async () => {
    const errors = await validateUpdateDto({ settings: 'not-an-object' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown top-level fields', async () => {
    const errors = await validateUpdateDto({ botToken: 'token', extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('CheckTelegramConfigDto', () => {
  it('should pass with empty data (all optional)', async () => {
    const errors = await validateCheckDto({});
    expect(errors).toHaveLength(0);
  });

  it('should pass with valid botToken', async () => {
    const errors = await validateCheckDto({ botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11' });
    expect(errors).toHaveLength(0);
  });

  it('should reject botToken longer than 256 characters', async () => {
    const errors = await validateCheckDto({ botToken: 'a'.repeat(257) });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should pass with valid groupChatId', async () => {
    const errors = await validateCheckDto({ groupChatId: '-123456789' });
    expect(errors).toHaveLength(0);
  });

  it('should reject groupChatId longer than 128 characters', async () => {
    const errors = await validateCheckDto({ groupChatId: 'a'.repeat(129) });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown fields', async () => {
    const errors = await validateCheckDto({ botToken: 'token', extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
