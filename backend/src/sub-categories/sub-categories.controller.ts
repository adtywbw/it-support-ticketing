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
import { SubCategoriesService } from './sub-categories.service';
import { CreateSubCategoryDto } from './dto/create-sub-category.dto';
import { UpdateSubCategoryDto } from './dto/update-sub-category.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Sub-Categories')
@ApiBearerAuth()
@Controller('categories/:categoryId/sub-categories')
export class SubCategoriesController {
  constructor(
    private readonly subCategoriesService: SubCategoriesService,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async findByCategoryId(
    @Param('categoryId') categoryId: string,
    @CurrentUser('role') role: Role,
  ) {
    return this.subCategoriesService.findByCategoryId(categoryId, role);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async create(
    @Param('categoryId') categoryId: string,
    @Body() createSubCategoryDto: CreateSubCategoryDto,
  ) {
    return this.subCategoriesService.create({ ...createSubCategoryDto, categoryId });
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async update(
    @Param('id') id: string,
    @Body() updateSubCategoryDto: UpdateSubCategoryDto,
  ) {
    return this.subCategoriesService.update(id, updateSubCategoryDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async delete(@Param('id') id: string) {
    await this.subCategoriesService.delete(id);
    return { message: 'Sub-category deleted successfully' };
  }
}
