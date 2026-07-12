import { IsIn, IsOptional } from 'class-validator';

export const FAQ_ANALYTICS_RANGES = ['30d'] as const;
export type FaqAnalyticsRange = (typeof FAQ_ANALYTICS_RANGES)[number];

export class QueryFaqAnalyticsDto {
  @IsOptional()
  @IsIn(FAQ_ANALYTICS_RANGES)
  range: FaqAnalyticsRange = '30d';
}
