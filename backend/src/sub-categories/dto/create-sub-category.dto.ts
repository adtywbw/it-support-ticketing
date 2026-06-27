import { Transform } from 'class-transformer';
import { IsString, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';

const trimString = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const trimOptionalString = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

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
