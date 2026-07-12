import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { trimOptionalString } from '../../common/utils/transform.util';

export class QueryFaqRecommendationsDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  query?: string;
}
