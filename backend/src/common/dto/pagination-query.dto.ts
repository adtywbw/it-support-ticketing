import { IsOptional, IsInt, Min, Max, IsString, IsEnum, IsBooleanString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { Role } from '@prisma/client';

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
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  @MaxLength(200)
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
