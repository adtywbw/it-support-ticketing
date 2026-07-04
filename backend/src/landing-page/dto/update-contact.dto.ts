import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trimString = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class UpdateContactDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(64)
  phone?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  hours?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  location?: string;
}