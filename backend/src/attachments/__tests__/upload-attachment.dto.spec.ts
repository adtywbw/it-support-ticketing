import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UploadAttachmentDto } from '../dto/upload-attachment.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(UploadAttachmentDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('UploadAttachmentDto', () => {
  it('should pass with empty data (all optional)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('should accept valid visibility PUBLIC', async () => {
    const errors = await validateDto({ visibility: 'PUBLIC' });
    expect(errors).toHaveLength(0);
  });

  it('should accept valid visibility INTERNAL', async () => {
    const errors = await validateDto({ visibility: 'INTERNAL' });
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid visibility', async () => {
    const errors = await validateDto({ visibility: 'INVALID' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isEnum');
  });

  it('should reject non-string visibility', async () => {
    const errors = await validateDto({ visibility: 123 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ visibility: 'PUBLIC', extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
