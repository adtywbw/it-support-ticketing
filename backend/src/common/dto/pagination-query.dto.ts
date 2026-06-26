import { IsOptional, IsInt, Min, Max, IsString, IsEnum, IsBooleanString } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class QueryUsersDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBooleanString()
  includeInactive?: string;
}

export class QueryNotificationsDto extends PaginationQueryDto {
  @IsOptional()
  @IsBooleanString()
  unreadOnly?: string;
}
