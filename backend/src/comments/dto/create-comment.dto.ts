import { IsString, IsOptional, IsEnum } from 'class-validator';
import { CommentType } from '@prisma/client';

export class CreateCommentDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsEnum(CommentType)
  type?: CommentType;
}
