import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsUUID, ValidateIf } from 'class-validator';
import { CreateFaqDto } from './create-faq.dto';

export class UpdateFaqDto extends PartialType(
  OmitType(CreateFaqDto, ['subCategoryId'] as const),
) {
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  @IsNotEmpty()
  subCategoryId?: string;
}
