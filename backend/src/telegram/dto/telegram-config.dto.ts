import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const TELEGRAM_EVENTS = [
  'ticket.created',
  'ticket.assigned',
  'ticket.status.updated',
] as const;

export class TelegramTemplatesDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  'ticket.created'?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  'ticket.assigned'?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  'ticket.status.updated'?: string;
}

export class TelegramSettingsDto {
  @IsOptional()
  @IsArray()
  @IsIn(TELEGRAM_EVENTS, { each: true })
  enabledEvents?: string[];

  @IsOptional()
  @IsBoolean()
  enableGroupChat?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  groupChatId?: string;

  @IsOptional()
  @IsBoolean()
  notifyIndividualsWhenGroupChat?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramTemplatesDto)
  templates?: TelegramTemplatesDto;
}

export class UpdateTelegramConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  botToken?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramSettingsDto)
  settings?: TelegramSettingsDto;
}

export class CheckTelegramConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  botToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  groupChatId?: string;
}
