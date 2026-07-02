import { IsDateString, IsIn, IsOptional, ValidateIf } from 'class-validator';

export const DASHBOARD_RANGE_PRESETS = ['7d', '30d', '90d', 'custom'] as const;
export type DashboardRangePreset = (typeof DASHBOARD_RANGE_PRESETS)[number];

export class QueryDashboardStatsDto {
  @IsOptional()
  @IsIn(DASHBOARD_RANGE_PRESETS)
  range?: DashboardRangePreset;

  @ValidateIf((dto: QueryDashboardStatsDto) => dto.range === 'custom')
  @IsDateString()
  from?: string;

  @ValidateIf((dto: QueryDashboardStatsDto) => dto.range === 'custom')
  @IsDateString()
  to?: string;
}
