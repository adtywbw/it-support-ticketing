import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTicketDto } from '../dto/create-ticket.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(CreateTicketDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('CreateTicketDto', () => {
  const validData = {
    subject: 'Cannot login to portal',
    description: 'I am unable to login to the customer portal since this morning.',
    categoryId: '550e8400-e29b-41d4-a716-446655440000',
    subCategoryId: '550e8400-e29b-41d4-a716-446655440001',
    locationId: '550e8400-e29b-41d4-a716-446655440002',
    itemCode: '-',
  };

  it('should pass with valid data', async () => {
    const errors = await validateDto(validData);
    expect(errors).toHaveLength(0);
  });

  it('should reject whitespace-only subject', async () => {
    const errors = await validateDto({ ...validData, subject: '   ' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should reject whitespace-only description', async () => {
    const errors = await validateDto({ ...validData, description: '   ' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should reject subject shorter than 5 characters after trim', async () => {
    const errors = await validateDto({ ...validData, subject: '  ab  ' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('minLength');
  });

  it('should reject description shorter than 10 characters after trim', async () => {
    const errors = await validateDto({ ...validData, description: '  short  ' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('minLength');
  });

  it('should trim subject before validation', async () => {
    const errors = await validateDto({ ...validData, subject: '  Valid subject here  ' });
    expect(errors).toHaveLength(0);
  });

  it('should trim description before validation', async () => {
    const errors = await validateDto({ ...validData, description: '  Valid description here  ' });
    expect(errors).toHaveLength(0);
  });

  it('should reject missing subject', async () => {
    const errors = await validateDto({ ...validData, subject: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing description', async () => {
    const errors = await validateDto({ ...validData, description: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  describe('selfServiceSessionId', () => {
    it('should pass when selfServiceSessionId is a valid UUID', async () => {
      const errors = await validateDto({
        ...validData,
        selfServiceSessionId: '550e8400-e29b-41d4-a716-446655440003',
      });
      expect(errors).toHaveLength(0);
    });

    it('should pass when selfServiceSessionId is not provided', async () => {
      const errors = await validateDto(validData);
      expect(errors).toHaveLength(0);
    });

    it('should reject an invalid UUID for selfServiceSessionId', async () => {
      const errors = await validateDto({
        ...validData,
        selfServiceSessionId: 'not-a-valid-uuid',
      });
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
