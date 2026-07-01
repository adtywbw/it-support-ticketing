import { Transform } from 'class-transformer';
import { IsString, IsOptional, IsBoolean, MaxLength, IsNotEmpty } from 'class-validator';

const trimString = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const trimOptionalString = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class UpdateSubCategoryDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
