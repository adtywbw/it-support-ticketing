import { Transform } from 'class-transformer';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsEnum,
  IsNotEmpty,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Priority } from '@prisma/client';
import { trimString } from '../../common/utils/transform.util';

export class CreateTicketDto {
  @ApiProperty({ description: 'Ticket subject', example: 'Cannot access email account' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(255)
  subject: string;

  @ApiProperty({ description: 'Detailed description of the issue', example: 'I have been unable to access my email account since this morning...' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(10000)
  description: string;

  @ApiProperty({ description: 'Category ID for the ticket', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ description: 'Sub-category ID', example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  @IsNotEmpty()
  subCategoryId: string;

  @ApiProperty({ description: 'Location ID', example: '550e8400-e29b-41d4-a716-446655440002' })
  @IsUUID()
  @IsNotEmpty()
  locationId: string;

  @ApiProperty({ description: 'Item code / part number', example: 'IC-001' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50)
  itemCode: string;

  @ApiProperty({ description: 'Ticket priority', enum: Priority, required: false, example: 'MEDIUM' })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;
}
