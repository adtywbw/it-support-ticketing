import { IsBoolean, IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

const trimString = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class FaqEntryDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  question: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  answer: string;

  @IsInt()
  @Min(0)
  order: number;

  @IsBoolean()
  active: boolean;
}