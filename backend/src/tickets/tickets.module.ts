import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { AttachmentsModule } from '../attachments/attachments.module';
import { SLAModule } from '../sla/sla.module';

@Module({
  imports: [AttachmentsModule, SLAModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
