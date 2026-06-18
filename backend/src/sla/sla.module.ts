import { Module } from '@nestjs/common';
import { SLAService } from './sla.service';
import { SLAController } from './sla.controller';

@Module({
  controllers: [SLAController],
  providers: [SLAService],
  exports: [SLAService],
})
export class SLAModule {}
