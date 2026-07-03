import { IsObject } from 'class-validator';
import { Transform } from 'class-transformer';

function toPlainObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export class UpdateNotificationPreferencesDto {
  @Transform(({ value }) => toPlainObject(value))
  @IsObject()
  preferences: Record<string, boolean>;
}
