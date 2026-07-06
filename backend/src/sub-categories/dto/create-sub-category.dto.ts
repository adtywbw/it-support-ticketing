import { Transform } from 'class-transformer';
import { IsString, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';
import { trimString, trimOptionalString } from '../../common/utils/transform.util';

export class CreateSubCategoryDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsString()
  @MaxLength(1000)
  description?: string;
}
