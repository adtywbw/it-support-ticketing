import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { trimOptionalString } from '../../common/utils/transform.util';

export class QueryFaqRecommendationsDto {
  @IsUUID()
  @IsNotEmpty()
  subCategoryId!: string;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsString()
  @MaxLength(255)
  query?: string;
}
