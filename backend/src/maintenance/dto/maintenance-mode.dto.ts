import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class MaintenanceModeDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  message?: string;
}
