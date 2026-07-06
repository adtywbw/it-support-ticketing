import { IsEnum, IsNotEmpty } from 'class-validator';
import { Priority } from '@prisma/client';

export class UpdatePriorityDto {
  @IsEnum(Priority)
  @IsNotEmpty()
  priority: Priority;
}
