import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramListener } from './telegram.listener';

@Module({
  controllers: [TelegramController],
  providers: [TelegramService, TelegramListener],
  exports: [TelegramService],
})
export class TelegramModule {}
