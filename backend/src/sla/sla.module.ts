import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../common/repositories/repositories.module';
import { SLAService } from './sla.service';
import { SLAController } from './sla.controller';

@Module({
  imports: [RepositoriesModule],
  controllers: [SLAController],
  providers: [SLAService],
  exports: [SLAService],
})
export class SLAModule {}
