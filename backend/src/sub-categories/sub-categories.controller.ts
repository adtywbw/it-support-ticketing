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
import { Role } from '@prisma/client';
import { SubCategoriesService } from './sub-categories.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('categories/:categoryId/sub-categories')
@UseGuards(JwtAuthGuard)
export class SubCategoriesController {
  constructor(
    private readonly subCategoriesService: SubCategoriesService,
  ) {}

  @Get()
  async findByCategoryId(@Param('categoryId') categoryId: string) {
    return this.subCategoriesService.findByCategoryId(categoryId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async create(
    @Param('categoryId') categoryId: string,
    @Body() body: { name: string; description?: string },
  ) {
    return this.subCategoriesService.create({ ...body, categoryId });
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; isActive?: boolean },
  ) {
    return this.subCategoriesService.update(id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async delete(@Param('id') id: string) {
    await this.subCategoriesService.delete(id);
    return { message: 'Sub-category deleted successfully' };
  }
}
