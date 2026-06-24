import { IsOptional, IsUUID } from 'class-validator';

export class AssignTicketDto {
  @IsOptional()
  @IsUUID()
  assignedToId?: string | null;
}
