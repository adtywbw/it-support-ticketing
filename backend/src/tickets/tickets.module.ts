import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../common/repositories/repositories.module';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { AttachmentsModule } from '../attachments/attachments.module';
import { SLAModule } from '../sla/sla.module';

@Module({
  imports: [RepositoriesModule, AttachmentsModule, SLAModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
