import { IsString, IsOptional, IsEnum, IsNotEmpty, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CommentType } from '@prisma/client';
import { trimString } from '../../common/utils/transform.util';

export class CreateCommentDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(10000)
  content: string;

  @IsOptional()
  @IsEnum(CommentType)
  type?: CommentType;
}
