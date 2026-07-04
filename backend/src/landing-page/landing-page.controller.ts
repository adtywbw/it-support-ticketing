import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { LandingPageService } from './landing-page.service';
import type { LandingPageContent } from './landing-page.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UpdateLandingPageContentDto } from './dto/update-landing-page-content.dto';

@Controller('landing-page')
export class LandingPageController {
  constructor(private readonly landingPageService: LandingPageService) {}

  @Get('content')
  @Public()
  async getPublicContent(): Promise<LandingPageContent> {
    return this.landingPageService.getPublicContent();
  }

  @Put('content')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async updateContent(@Body() body: UpdateLandingPageContentDto): Promise<LandingPageContent> {
    return this.landingPageService.updateContent(body);
  }

  @Get('content/admin')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async getAdminContent(): Promise<LandingPageContent> {
    return this.landingPageService.getContent();
  }
}
