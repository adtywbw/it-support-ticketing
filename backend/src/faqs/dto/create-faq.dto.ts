import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, IsInt, IsBoolean, IsOptional, IsUUID, IsArray, ArrayMaxSize, Min, MaxLength } from 'class-validator';
import { trimString } from '../../common/utils/transform.util';

export function normalizeFaqKeywords(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return [...new Set(
    value
      .map((item) => typeof item === 'string'
        ? item.trim().toLowerCase().replace(/\s+/g, ' ')
        : item)
      .filter((item) => item !== ''),
  )];
}

export class CreateFaqDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  question!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  answer!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  showOnLogin?: boolean;

  @IsUUID()
  subCategoryId!: string;

  @IsOptional()
  @Transform(({ value }) => normalizeFaqKeywords(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  keywords?: string[];
}
