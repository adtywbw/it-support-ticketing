import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { trimString } from '../../common/utils/transform.util';

export class CreateUserDto {
  @ApiProperty({ description: 'User email address', example: 'user@example.com' })
  @Transform(trimString)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ description: 'User password (min 8 characters)', example: 'securePassword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ description: 'User full name', example: 'John Doe' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: 'User role', enum: Role, required: false, example: 'EndUser' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
