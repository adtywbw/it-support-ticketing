import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TicketStatus } from '@prisma/client';

export class UpdateStatusDto {
  @ApiProperty({ description: 'New ticket status', enum: TicketStatus, example: 'IN_PROGRESS' })
  @IsEnum(TicketStatus)
  @IsNotEmpty()
  status: TicketStatus;
}
