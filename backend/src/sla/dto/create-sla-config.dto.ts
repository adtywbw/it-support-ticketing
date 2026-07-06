import { IsUUID, IsEnum, IsInt, IsNotEmpty, Min } from 'class-validator';
import { Priority } from '@prisma/client';

export class CreateSlaConfigDto {
  @IsUUID()
  categoryId: string;

  @IsEnum(Priority)
  @IsNotEmpty()
  priority: Priority;

  @IsInt()
  @Min(1)
  responseTimeMinutes: number;

  @IsInt()
  @Min(1)
  resolutionTimeMinutes: number;
}
