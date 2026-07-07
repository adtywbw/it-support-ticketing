import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../common/repositories/repositories.module';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [RepositoriesModule, AttachmentsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
