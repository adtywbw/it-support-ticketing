import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { TelegramService } from './telegram.service';
import type { TelegramSettings } from './telegram.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('telegram')
@UseGuards(JwtAuthGuard)
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('link')
  async generateCode(@CurrentUser('id') userId: string) {
    const code = await this.telegramService.generateLinkCode(userId);
    return { code, expiresIn: 300 };
  }

  @Delete('link')
  async unlink(@CurrentUser('id') userId: string) {
    await this.telegramService.unlink(userId);
    return { message: 'Telegram unlinked' };
  }

  @Get('status')
  async status(@CurrentUser('id') userId: string) {
    return this.telegramService.getStatus(userId);
  }

  @Get('config')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async getConfig() {
    return this.telegramService.getConfig();
  }

  @Put('config')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async updateConfig(
    @Body() body: { botToken?: string; settings?: TelegramSettings },
  ) {
    return this.telegramService.updateConfig(body);
  }
}
