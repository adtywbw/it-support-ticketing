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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { MaintenanceService } from './maintenance.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RestoreBackupDto } from './dto/restore-backup.dto';
import { MaintenanceModeDto } from './dto/maintenance-mode.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Maintenance')
@ApiBearerAuth()
@Controller('maintenance')
export class MaintenanceController {
  constructor(
    private readonly maintenanceService: MaintenanceService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('mode')
  @Public()
  getMaintenanceMode() {
    return this.maintenanceService.getMaintenanceMode();
  }

  @Patch('mode')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async setMaintenanceMode(@Body() dto: MaintenanceModeDto) {
    await this.maintenanceService.setMaintenanceMode(dto.enabled, dto.message);
    return this.maintenanceService.getMaintenanceMode();
  }

  @Get('backups')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  listBackups() {
    return this.maintenanceService.listBackups();
  }

  @Post('backups')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  createBackup() {
    return this.maintenanceService.createBackup();
  }

  @Delete('backups/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async deleteBackup(@Param('id') id: string) {
    await this.maintenanceService.deleteBackup(id);
    return { message: 'Backup deleted successfully' };
  }

  @Post('backups/:id/restore')
  @UseGuards(RolesGuard)
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
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async downloadDatabaseBackup(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const filePath = await this.maintenanceService.getBackupFilePath(id, 'db');
    res.download(filePath, `${id}-db.sql.gz`);
  }

  @Get('backups/:id/download/uploads')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async downloadUploadsBackup(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const filePath = await this.maintenanceService.getBackupFilePath(id, 'uploads');
    res.download(filePath, `${id}-uploads.tar.gz`);
  }

  @Get('performance')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async getPerformance() {
    const slowQueries = await this.prisma.$queryRaw<Array<{
      query: string;
      calls: number;
      mean_time: number;
      total_time: number;
      rows: number;
    }>>`
      SELECT query, calls,
             ROUND(mean_time::numeric, 2) AS mean_time,
             ROUND(total_time::numeric, 2) AS total_time,
             rows
      FROM pg_stat_statements
      ORDER BY mean_time DESC
      LIMIT 20
    `.catch(() => []);

    const connectionCount = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int FROM pg_stat_activity WHERE state = 'active'
    `.catch(() => [{ count: 0 }]);

    return {
      slowQueries,
      activeConnections: connectionCount[0]?.count ?? 0,
      timestamp: new Date().toISOString(),
    };
  }
}
