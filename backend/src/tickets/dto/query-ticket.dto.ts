import {
  IsOptional,
  IsEnum,
  IsString,
  IsInt,
  IsUUID,
  Min,
  Max,
  MaxLength,
  IsDateString,
  IsIn,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TicketStatus, Priority, SLAStatus } from '@prisma/client';

/** Split comma-separated query param into array for multi-select filters. */
function splitComma({ value }: { value: unknown }): string[] | undefined {
  if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(value)) return value;
  return undefined;
}

export class QueryTicketDto {
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

  @IsOptional()
  @Transform(splitComma)
  @IsEnum(TicketStatus, { each: true })
  status?: TicketStatus[];

  @IsOptional()
  @Transform(splitComma)
  @IsEnum(Priority, { each: true })
  priority?: Priority[];

  @IsOptional()
  @Transform(splitComma)
  @IsUUID('4', { each: true })
  categoryId?: string[];

  @IsOptional()
  @Transform(splitComma)
  @IsUUID('4', { each: true })
  locationId?: string[];

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @Transform(splitComma)
  @IsUUID('4', { each: true })
  requesterId?: string[];

  @IsOptional()
  @Transform(splitComma)
  @IsEnum(SLAStatus, { each: true })
  slaStatus?: SLAStatus[];

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'slaDueAt', 'priority', 'ticketNumber', 'subject', 'status', 'slaStatus', 'itemCode', 'category', 'location', 'assignedTo', 'requester'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
