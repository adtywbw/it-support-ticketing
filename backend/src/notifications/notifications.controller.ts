import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { QueryNotificationsDto } from '../common/dto/pagination-query.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationsService.findByUserId(userId, {
      page: query.page,
      limit: query.limit,
      unreadOnly: query.unreadOnly === 'true',
    });
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser('id') userId: string) {
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.notificationsService.markAsRead(id, userId);
    return { message: 'Notification marked as read' };
  }

  @Patch('read-all')
  async markAllAsRead(@CurrentUser('id') userId: string) {
    await this.notificationsService.markAllAsRead(userId);
    return { message: 'All notifications marked as read' };
  }

  @Delete()
  async clearAll(@CurrentUser('id') userId: string) {
    await this.notificationsService.clearAll(userId);
    return { message: 'All notifications cleared' };
  }
}
