import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { QueryUsersDto } from '../common/dto/pagination-query.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.Admin)
  async findAll(
    @Query() query: QueryUsersDto,
  ) {
    return this.usersService.findAll({
      page: query.page,
      limit: query.limit,
      role: query.role,
      search: query.search,
      includeInactive: query.includeInactive === 'true',
    });
  }

  @Get('assignable')
  @Roles(Role.ITSupport, Role.Admin)
  async findAssignable() {
    return this.usersService.findAssignable();
  }

  @Get(':id')
  @Roles(Role.Admin)
  async findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @Roles(Role.Admin)
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Patch(':id')
  @Roles(Role.Admin)
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    await this.usersService.delete(id, user.id);
    return { message: 'User deleted successfully' };
  }
}
