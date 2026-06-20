import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
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

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.ticketsService.findById(id);
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
