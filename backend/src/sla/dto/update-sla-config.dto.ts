import { IsInt, Min, IsBoolean, IsOptional } from 'class-validator';

export class UpdateSlaConfigDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  responseTimeMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  resolutionTimeMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
