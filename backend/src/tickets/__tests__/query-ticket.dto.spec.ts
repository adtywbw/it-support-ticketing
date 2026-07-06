import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryTicketDto } from '../dto/query-ticket.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(QueryTicketDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('QueryTicketDto', () => {
  it('should pass with empty data (all optional)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('should pass with valid page and limit', async () => {
    const errors = await validateDto({ page: 1, limit: 20 });
    expect(errors).toHaveLength(0);
  });

  it('should reject page less than 1', async () => {
    const errors = await validateDto({ page: 0 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('should reject limit greater than 100', async () => {
    const errors = await validateDto({ limit: 101 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('max');
  });

  it('should reject non-integer page', async () => {
    const errors = await validateDto({ page: 1.5 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isInt');
  });

  it('should accept valid status enum', async () => {
    const errors = await validateDto({ status: 'Open' });
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid status', async () => {
    const errors = await validateDto({ status: 'InvalidStatus' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid priority enum', async () => {
    const errors = await validateDto({ priority: 'Critical' });
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid priority', async () => {
    const errors = await validateDto({ priority: 'Urgent' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject non-UUID categoryId', async () => {
    const errors = await validateDto({ categoryId: 'not-a-uuid' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isUuid');
  });

  it('should accept valid UUID categoryId', async () => {
    const errors = await validateDto({ categoryId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(errors).toHaveLength(0);
  });

  it('should accept valid UUID assignedToId', async () => {
    const errors = await validateDto({ assignedToId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(errors).toHaveLength(0);
  });

  it('should accept valid UUID requesterId', async () => {
    const errors = await validateDto({ requesterId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(errors).toHaveLength(0);
  });

  it('should accept valid slaStatus enum', async () => {
    const errors = await validateDto({ slaStatus: 'OnTrack' });
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid slaStatus', async () => {
    const errors = await validateDto({ slaStatus: 'Unknown' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid dateFrom string', async () => {
    const errors = await validateDto({ dateFrom: '2024-01-01' });
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid dateFrom', async () => {
    const errors = await validateDto({ dateFrom: 'not-a-date' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isDateString');
  });

  it('should accept valid dateTo string', async () => {
    const errors = await validateDto({ dateTo: '2024-12-31' });
    expect(errors).toHaveLength(0);
  });

  it('should reject search longer than 200 characters', async () => {
    const errors = await validateDto({ search: 'a'.repeat(201) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('should accept valid sortOrder', async () => {
    const errors = await validateDto({ sortOrder: 'asc' });
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid sortOrder', async () => {
    const errors = await validateDto({ sortOrder: 'invalid' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isIn');
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
