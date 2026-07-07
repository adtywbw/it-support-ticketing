import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../common/repositories/repositories.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RepositoriesModule, RedisModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
