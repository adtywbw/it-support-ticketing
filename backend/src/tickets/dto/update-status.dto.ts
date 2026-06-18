import { IsEnum } from 'class-validator';
import { TicketStatus } from '@prisma/client';

export class UpdateStatusDto {
  @IsEnum(TicketStatus)
  status: TicketStatus;
}
