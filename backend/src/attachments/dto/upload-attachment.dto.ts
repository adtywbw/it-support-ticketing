import { IsEnum, IsOptional } from 'class-validator';
import { AttachmentVisibility } from '@prisma/client';

export class UploadAttachmentDto {
  @IsOptional()
  @IsEnum(AttachmentVisibility, {
    message: `visibility must be one of: ${Object.values(AttachmentVisibility).join(', ')}`,
  })
  visibility?: AttachmentVisibility;
}
