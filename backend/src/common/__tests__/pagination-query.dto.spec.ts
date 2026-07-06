import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto, QueryUsersDto, QueryNotificationsDto } from '../dto/pagination-query.dto';

async function validatePaginationDto(data: Record<string, unknown>) {
  const dto = plainToInstance(PaginationQueryDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

async function validateQueryUsersDto(data: Record<string, unknown>) {
  const dto = plainToInstance(QueryUsersDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

async function validateQueryNotificationsDto(data: Record<string, unknown>) {
  const dto = plainToInstance(QueryNotificationsDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('PaginationQueryDto', () => {
  it('should pass with empty data (all optional)', async () => {
    const errors = await validatePaginationDto({});
    expect(errors).toHaveLength(0);
  });

  it('should pass with valid page and limit', async () => {
    const errors = await validatePaginationDto({ page: 1, limit: 20 });
    expect(errors).toHaveLength(0);
  });

  it('should reject page less than 1', async () => {
    const errors = await validatePaginationDto({ page: 0 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('should reject limit greater than 100', async () => {
    const errors = await validatePaginationDto({ limit: 101 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('max');
  });

  it('should reject non-integer page', async () => {
    const errors = await validatePaginationDto({ page: 1.5 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isInt');
  });

  it('should reject limit less than 1', async () => {
    const errors = await validatePaginationDto({ limit: 0 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('should reject unknown fields', async () => {
    const errors = await validatePaginationDto({ page: 1, extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('QueryUsersDto', () => {
  it('should pass with empty data', async () => {
    const errors = await validateQueryUsersDto({});
    expect(errors).toHaveLength(0);
  });

  it('should accept valid role enum', async () => {
    const errors = await validateQueryUsersDto({ role: 'Admin' });
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid role', async () => {
    const errors = await validateQueryUsersDto({ role: 'SuperAdmin' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid search string', async () => {
    const errors = await validateQueryUsersDto({ search: 'john' });
    expect(errors).toHaveLength(0);
  });

  it('should reject search longer than 200 characters', async () => {
    const errors = await validateQueryUsersDto({ search: 'a'.repeat(201) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('should accept valid includeInactive boolean string', async () => {
    const errors = await validateQueryUsersDto({ includeInactive: 'true' });
    expect(errors).toHaveLength(0);
  });

  it('should reject non-boolean-string includeInactive', async () => {
    const errors = await validateQueryUsersDto({ includeInactive: 'yes' });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('QueryNotificationsDto', () => {
  it('should pass with empty data', async () => {
    const errors = await validateQueryNotificationsDto({});
    expect(errors).toHaveLength(0);
  });

  it('should accept valid unreadOnly boolean string', async () => {
    const errors = await validateQueryNotificationsDto({ unreadOnly: 'true' });
    expect(errors).toHaveLength(0);
  });

  it('should reject non-boolean-string unreadOnly', async () => {
    const errors = await validateQueryNotificationsDto({ unreadOnly: 'yes' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
