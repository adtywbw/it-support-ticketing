import { IsString, IsOptional, IsEnum, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CommentType } from '@prisma/client';
import { trimString } from '../../common/utils/transform.util';

export class CreateCommentDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;

  @IsOptional()
  @IsEnum(CommentType)
  type?: CommentType;
}
