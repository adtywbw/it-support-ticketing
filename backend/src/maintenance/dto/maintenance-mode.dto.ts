import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class MaintenanceModeDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Maintenance message must not be empty' })
  @MaxLength(1000, { message: 'Maintenance message must not exceed 1000 characters' })
  message?: string;
}
