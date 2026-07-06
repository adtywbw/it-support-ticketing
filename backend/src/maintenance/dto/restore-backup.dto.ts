import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { trimString } from '../../common/utils/transform.util';

export class RestoreBackupDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  confirmation!: string;
}
