import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../common/repositories/repositories.module';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramListener } from './telegram.listener';

@Module({
  imports: [RepositoriesModule],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramListener],
  exports: [TelegramService],
})
export class TelegramModule {}
