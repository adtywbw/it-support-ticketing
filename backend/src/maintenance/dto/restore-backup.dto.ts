import { IsNotEmpty, IsString } from 'class-validator';

export class RestoreBackupDto {
  @IsString()
  @IsNotEmpty()
  confirmation!: string;
}
