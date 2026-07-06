import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssignTicketDto } from '../dto/assign-ticket.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(AssignTicketDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('AssignTicketDto', () => {
  it('should pass with valid UUID', async () => {
    const errors = await validateDto({ assignedToId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(errors).toHaveLength(0);
  });

  it('should pass with null assignedToId', async () => {
    const errors = await validateDto({ assignedToId: null });
    expect(errors).toHaveLength(0);
  });

  it('should pass with undefined assignedToId', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid UUID format', async () => {
    const errors = await validateDto({ assignedToId: 'not-a-uuid' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isUuid');
  });

  it('should reject non-string assignedToId', async () => {
    const errors = await validateDto({ assignedToId: 123 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ assignedToId: '550e8400-e29b-41d4-a716-446655440000', extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
