import {
  Controller,
  Delete,
  Get,
  Post,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { MaintenanceService } from './maintenance.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('maintenance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get('backups')
  listBackups() {
    return this.maintenanceService.listBackups();
  }

  @Post('backups')
  createBackup() {
    return this.maintenanceService.createBackup();
  }

  @Delete('backups/:id')
  async deleteBackup(@Param('id') id: string) {
    await this.maintenanceService.deleteBackup(id);
    return { message: 'Backup deleted successfully' };
  }

  @Get('backups/:id/download/db')
  async downloadDatabaseBackup(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const filePath = await this.maintenanceService.getBackupFilePath(id, 'db');
    res.download(filePath, `${id}-db.sql.gz`);
  }

  @Get('backups/:id/download/uploads')
  async downloadUploadsBackup(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const filePath = await this.maintenanceService.getBackupFilePath(id, 'uploads');
    res.download(filePath, `${id}-uploads.tar.gz`);
  }
}
