import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePriorityDto } from '../dto/update-priority.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(UpdatePriorityDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('UpdatePriorityDto', () => {
  it('should pass with valid priority', async () => {
    const errors = await validateDto({ priority: 'High' });
    expect(errors).toHaveLength(0);
  });

  it('should accept all valid priority values', async () => {
    for (const priority of ['Low', 'Medium', 'High', 'Critical']) {
      const errors = await validateDto({ priority });
      expect(errors).toHaveLength(0);
    }
  });

  it('should reject invalid priority', async () => {
    const errors = await validateDto({ priority: 'Urgent' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isEnum');
  });

  it('should reject missing priority', async () => {
    const errors = await validateDto({ priority: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject non-string priority', async () => {
    const errors = await validateDto({ priority: 123 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ priority: 'Low', extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
