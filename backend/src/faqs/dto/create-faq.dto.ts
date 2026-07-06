import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, IsInt, IsBoolean, IsOptional, Min, MaxLength } from 'class-validator';
import { trimString } from '../../common/utils/transform.util';

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
}
