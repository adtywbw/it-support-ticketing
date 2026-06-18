import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { Role, Priority } from '@prisma/client';
import { SLAService } from './sla.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('sla-configs')
@UseGuards(JwtAuthGuard)
export class SLAController {
  constructor(private readonly slaService: SLAService) {}

  @Get()
  async findAll() {
    return this.slaService.findAll();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async create(
    @Body()
    body: {
      categoryId: string;
      priority: Priority;
      responseTimeMinutes: number;
      resolutionTimeMinutes: number;
    },
  ) {
    return this.slaService.create(body);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      responseTimeMinutes?: number;
      resolutionTimeMinutes?: number;
      isActive?: boolean;
    },
  ) {
    return this.slaService.update(id, body);
  }
}
