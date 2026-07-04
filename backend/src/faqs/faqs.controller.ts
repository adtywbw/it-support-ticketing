import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { FaqsService } from './faqs.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('faqs')
@UseGuards(JwtAuthGuard)
export class FaqsController {
  constructor(private readonly faqsService: FaqsService) {}

  @Public()
  @Get()
  findAllPublic() {
    return this.faqsService.findActiveOrdered();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Get('all')
  findAllAdmin() {
    return this.faqsService.findAll();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Post()
  create(@Body() createFaqDto: CreateFaqDto) {
    return this.faqsService.create(createFaqDto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFaqDto: UpdateFaqDto) {
    return this.faqsService.update(id, updateFaqDto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.faqsService.remove(id);
    return { message: 'FAQ deleted successfully' };
  }
}
