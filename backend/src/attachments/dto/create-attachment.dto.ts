import { IsString } from 'class-validator';

export class CreateAttachmentDto {
  @IsString()
  ticketId: string;

  @IsString()
  originalName: string;

  @IsString()
  mimeType: string;

  size: number;

  @IsString()
  path: string;
}
