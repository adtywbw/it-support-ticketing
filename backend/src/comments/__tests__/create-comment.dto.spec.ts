import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCommentDto } from '../dto/create-comment.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(CreateCommentDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('CreateCommentDto', () => {
  it('should pass with valid content', async () => {
    const errors = await validateDto({ content: 'This is a valid comment' });
    expect(errors).toHaveLength(0);
  });

  it('should reject whitespace-only content', async () => {
    const errors = await validateDto({ content: '   ' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should trim content before validation', async () => {
    const errors = await validateDto({ content: '  Valid comment  ' });
    expect(errors).toHaveLength(0);
  });

  it('should reject missing content', async () => {
    const errors = await validateDto({ content: undefined });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should pass with optional type', async () => {
    const errors = await validateDto({ content: 'Valid comment', type: 'PUBLIC' });
    expect(errors).toHaveLength(0);
  });
});
