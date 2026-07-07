import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../common/repositories/repositories.module';
import { FaqsController } from './faqs.controller';
import { FaqsService } from './faqs.service';

@Module({
  imports: [RepositoriesModule],
  controllers: [FaqsController],
  providers: [FaqsService],
})
export class FaqsModule {}
