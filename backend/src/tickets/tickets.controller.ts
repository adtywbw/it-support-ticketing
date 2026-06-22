import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { UpdatePriorityDto } from './dto/update-priority.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  async findAll(
    @Query() queryTicketDto: QueryTicketDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.ticketsService.findAll(queryTicketDto, user.role, user.id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.EndUser, Role.ITSupport, Role.Admin)
  async create(
    @Body() createTicketDto: CreateTicketDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ticketsService.create(createTicketDto, userId);
  }

  @Get('export/csv')
  @UseGuards(RolesGuard)
  @Roles(Role.ITSupport, Role.Admin)
  async exportCsv(
    @Query() queryTicketDto: QueryTicketDto,
    @CurrentUser() user: { id: string; role: Role },
    @Res() res: Response,
  ) {
    const csv = await this.ticketsService.exportCsv(queryTicketDto, user.role, user.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tickets-export.csv"');
    res.send(csv);
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.ticketsService.findById(id, user.role, user.id);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ticketsService.updateStatus(id, updateStatusDto, userId);
  }

  @Patch(':id/assign')
  @UseGuards(RolesGuard)
  @Roles(Role.ITSupport, Role.Admin)
  async assignTicket(
    @Param('id') id: string,
    @Body() assignTicketDto: AssignTicketDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ticketsService.assignTicket(id, assignTicketDto, userId);
  }

  @Patch(':id/priority')
  @UseGuards(RolesGuard)
  @Roles(Role.ITSupport, Role.Admin)
  async updatePriority(
    @Param('id') id: string,
    @Body() updatePriorityDto: UpdatePriorityDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ticketsService.updatePriority(id, updatePriorityDto, userId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async delete(@Param('id') id: string) {
    await this.ticketsService.delete(id);
    return { message: 'Ticket deleted successfully' };
  }
}
