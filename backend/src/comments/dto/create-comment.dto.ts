import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { CommentType } from '@prisma/client';

export class CreateCommentDto {
  @IsString()
  @MaxLength(10000)
  content: string;

  @IsOptional()
  @IsEnum(CommentType)
  type?: CommentType;
}
