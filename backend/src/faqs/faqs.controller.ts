import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { FaqsService } from './faqs.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { QueryFaqRecommendationsDto } from './dto/query-faq-recommendations.dto';
import { QueryFaqAnalyticsDto } from './dto/query-faq-analytics.dto';
import { CreateFaqInteractionDto } from './dto/create-faq-interaction.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('FAQs')
@Controller('faqs')
export class FaqsController {
  constructor(private readonly faqsService: FaqsService) {}

  @Get('recommendations')
  getRecommendations(@Query() query: QueryFaqRecommendationsDto) {
    return this.faqsService.getRecommendations(query);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Get('analytics')
  getAnalytics(@Query() query: QueryFaqAnalyticsDto) {
    return this.faqsService.getAnalytics(query);
  }

  @Post('interactions')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async recordInteraction(
    @Body() dto: CreateFaqInteractionDto,
    @CurrentUser('id') userId: string,
  ) {
    await this.faqsService.recordInteraction(dto, userId);
    return { recorded: true };
  }

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
