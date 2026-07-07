import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RepositoriesModule } from '../common/repositories/repositories.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { jwtModuleConfig } from '../common/config/jwt.config';

@Module({
  imports: [
    RepositoriesModule,
    JwtModule.registerAsync(jwtModuleConfig),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService],
})
export class NotificationsModule {}
