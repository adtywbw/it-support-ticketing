import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, IsInt, IsBoolean, Min, MaxLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

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

  @IsInt()
  @Min(0)
  displayOrder?: number = 0;

  @IsBoolean()
  isActive?: boolean = true;
}
