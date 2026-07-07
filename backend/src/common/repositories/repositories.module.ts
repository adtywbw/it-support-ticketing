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
import { FaqRepository } from './faq.repository';
import { LocationRepository } from './location.repository';

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
    FaqRepository,
    LocationRepository,
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
    FaqRepository,
    LocationRepository,
  ],
})
export class RepositoriesModule {}
