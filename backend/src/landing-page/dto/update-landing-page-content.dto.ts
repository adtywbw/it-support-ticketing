import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateContactDto } from './update-contact.dto';
import { FaqEntryDto } from './faq-entry.dto';

export class UpdateLandingPageContentDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateContactDto)
  contact?: UpdateContactDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FaqEntryDto)
  faqs?: FaqEntryDto[];
}