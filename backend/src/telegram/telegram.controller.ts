import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { TelegramService } from './telegram.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CheckTelegramConfigDto, UpdateTelegramConfigDto } from './dto/telegram-config.dto';

@ApiTags('Telegram')
@ApiBearerAuth()
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('link')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async generateCode(@CurrentUser('id') userId: string) {
    const code = await this.telegramService.generateLinkCode(userId);
    return { code, expiresIn: 300 };
  }

  @Delete('link')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async unlink(@CurrentUser('id') userId: string) {
    await this.telegramService.unlink(userId);
    return { message: 'Telegram unlinked' };
  }

  @Get('status')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
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
    @Body() body: UpdateTelegramConfigDto,
  ) {
    return this.telegramService.updateConfig(body);
  }

  @Post('test-notification')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async sendTestNotification(@CurrentUser('id') userId: string) {
    await this.telegramService.sendTestNotification(userId);
    return { message: 'Test notification sent' };
  }

  @Post('check')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async check(
    @Body() body: CheckTelegramConfigDto,
  ) {
    return this.telegramService.checkConfig(body.botToken, body.groupChatId);
  }
}
