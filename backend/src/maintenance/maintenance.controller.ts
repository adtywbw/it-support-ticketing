import {
  Controller,
  Delete,
  Get,
  Body,
  Post,
  Patch,
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
import { RestoreBackupDto } from './dto/restore-backup.dto';
import { MaintenanceModeDto } from './dto/maintenance-mode.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get('mode')
  @Public()
  getMaintenanceMode() {
    return this.maintenanceService.getMaintenanceMode();
  }

  @Patch('mode')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async setMaintenanceMode(@Body() dto: MaintenanceModeDto) {
    await this.maintenanceService.setMaintenanceMode(dto.enabled, dto.message);
    return this.maintenanceService.getMaintenanceMode();
  }

  @Get('backups')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  listBackups() {
    return this.maintenanceService.listBackups();
  }

  @Post('backups')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  createBackup() {
    return this.maintenanceService.createBackup();
  }

  @Delete('backups/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async deleteBackup(@Param('id') id: string) {
    await this.maintenanceService.deleteBackup(id);
    return { message: 'Backup deleted successfully' };
  }

  @Post('backups/:id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async restoreBackup(
    @Param('id') id: string,
    @Body() restoreBackupDto: RestoreBackupDto,
  ) {
    const preRestoreBackup = await this.maintenanceService.restoreBackup(
      id,
      restoreBackupDto.confirmation,
    );
    return {
      message: 'Backup restored successfully. Please log in again.',
      preRestoreBackup,
    };
  }

  @Get('backups/:id/download/db')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async downloadDatabaseBackup(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const filePath = await this.maintenanceService.getBackupFilePath(id, 'db');
    res.download(filePath, `${id}-db.sql.gz`);
  }

  @Get('backups/:id/download/uploads')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async downloadUploadsBackup(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const filePath = await this.maintenanceService.getBackupFilePath(id, 'uploads');
    res.download(filePath, `${id}-uploads.tar.gz`);
  }
}
