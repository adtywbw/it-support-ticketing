import { Module } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { LocalStorageService } from './services/local-storage.service';

@Module({
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    {
      provide: 'StorageService',
      useClass: LocalStorageService,
    },
  ],
})
export class AttachmentsModule {}
