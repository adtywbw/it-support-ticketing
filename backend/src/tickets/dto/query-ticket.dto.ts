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
import { Type } from 'class-transformer';
import { TicketStatus, Priority, SLAStatus } from '@prisma/client';

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
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsUUID()
  requesterId?: string;

  @IsOptional()
  @IsEnum(SLAStatus)
  slaStatus?: SLAStatus;

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
  @IsIn(['createdAt', 'updatedAt', 'slaDueAt', 'priority', 'ticketNumber', 'subject', 'status', 'slaStatus'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
