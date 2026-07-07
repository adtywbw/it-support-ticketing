import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TicketsModule } from './tickets/tickets.module';
import { CommentsModule } from './comments/comments.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { CategoriesModule } from './categories/categories.module';
import { SubCategoriesModule } from './sub-categories/sub-categories.module';
import { SLAModule } from './sla/sla.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { TelegramModule } from './telegram/telegram.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { FaqsModule } from './faqs/faqs.module';
import { RepositoriesModule } from './common/repositories/repositories.module';
import { ServicesModule } from './common/services/services.module';
import { MaintenanceGuard } from './common/guards/maintenance.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { RedisService } from './redis/redis.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [{ limit: 10, ttl: 1000 }],
    }),
    EventEmitterModule.forRoot(),
    ServicesModule,
    PrismaModule,
    RepositoriesModule,
    RedisModule,
    AuthModule,
    UsersModule,
    TicketsModule,
    CommentsModule,
    AttachmentsModule,
    CategoriesModule,
    SubCategoriesModule,
    SLAModule,
    NotificationsModule,
    DashboardModule,
    HealthModule,
    TelegramModule,
    MaintenanceModule,
    FaqsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_GUARD,
      useFactory: (redis: RedisService, jwtService: JwtService, reflector: Reflector) =>
        new MaintenanceGuard(redis, jwtService, reflector),
      inject: [RedisService, JwtService, Reflector],
    },
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new JwtAuthGuard(reflector),
      inject: [Reflector],
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
