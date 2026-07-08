import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SLAService } from './sla.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateSlaConfigDto } from './dto/create-sla-config.dto';
import { UpdateSlaConfigDto } from './dto/update-sla-config.dto';

@ApiTags('SLA Configs')
@ApiBearerAuth()
@Controller('sla-configs')
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

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async delete(@Param('id') id: string) {
    await this.slaService.delete(id);
    return { message: 'SLA config deleted successfully' };
  }
}
