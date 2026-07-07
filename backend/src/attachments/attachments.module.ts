import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../common/repositories/repositories.module';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { LocalStorageService } from './services/local-storage.service';
import { STORAGE_SERVICE } from './interfaces/storage-service.interface';

@Module({
  imports: [RepositoriesModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    {
      provide: STORAGE_SERVICE,
      useClass: LocalStorageService,
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class AttachmentsModule {}
