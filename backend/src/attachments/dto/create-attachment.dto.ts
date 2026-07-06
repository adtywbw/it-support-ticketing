import { IsString, IsInt, Min } from 'class-validator';

export class CreateAttachmentDto {
  @IsString()
  ticketId: string;

  @IsString()
  originalName: string;

  @IsString()
  mimeType: string;

  @IsInt()
  @Min(0)
  size: number;

  @IsString()
  path: string;
}
