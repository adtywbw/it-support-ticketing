import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class MaintenanceModeDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Maintenance message must not exceed 1000 characters' })
  message?: string;
}
