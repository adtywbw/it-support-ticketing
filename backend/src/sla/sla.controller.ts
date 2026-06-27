import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { SLAService } from './sla.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateSlaConfigDto } from './dto/create-sla-config.dto';
import { UpdateSlaConfigDto } from './dto/update-sla-config.dto';

@Controller('sla-configs')
@UseGuards(JwtAuthGuard)
export class SLAController {
  constructor(private readonly slaService: SLAService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async findAll() {
    return this.slaService.findAll();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async create(@Body() body: CreateSlaConfigDto) {
    return this.slaService.create(body);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateSlaConfigDto,
  ) {
    return this.slaService.update(id, body);
  }
}
