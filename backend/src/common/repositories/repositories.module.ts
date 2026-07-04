import { Global, Module } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { TicketRepository } from './ticket.repository';
import { CommentRepository } from './comment.repository';
import { AttachmentRepository } from './attachment.repository';
import { CategoryRepository } from './category.repository';
import { SubCategoryRepository } from './sub-category.repository';
import { SlaConfigRepository } from './sla-config.repository';
import { NotificationRepository } from './notification.repository';
import { TelegramConfigRepository } from './telegram-config.repository';
import { LandingPageConfigRepository } from './landing-page-config.repository';

@Global()
@Module({
  providers: [
    UserRepository,
    TicketRepository,
    CommentRepository,
    AttachmentRepository,
    CategoryRepository,
    SubCategoryRepository,
    SlaConfigRepository,
    NotificationRepository,
    TelegramConfigRepository,
    LandingPageConfigRepository,
  ],
  exports: [
    UserRepository,
    TicketRepository,
    CommentRepository,
    AttachmentRepository,
    CategoryRepository,
    SubCategoryRepository,
    SlaConfigRepository,
    NotificationRepository,
    TelegramConfigRepository,
    LandingPageConfigRepository,
  ],
})
export class RepositoriesModule {}
