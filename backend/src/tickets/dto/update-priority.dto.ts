import { IsEnum } from 'class-validator';
import { Priority } from '@prisma/client';

export class UpdatePriorityDto {
  @IsEnum(Priority)
  priority: Priority;
}
