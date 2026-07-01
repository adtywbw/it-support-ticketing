import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

const trimString = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class RestoreBackupDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  confirmation!: string;
}
