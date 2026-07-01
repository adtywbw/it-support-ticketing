import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  async check(@Res() res: Response) {
    const checks: Record<string, string> = {};

    checks.database = (await this.prisma.healthCheck()) ? 'healthy' : 'unhealthy';

    try {
      const redisOk = await this.redisService.ping();
      checks.redis = redisOk ? 'healthy' : 'unhealthy';
    } catch {
      checks.redis = 'unhealthy';
    }

    const isHealthy = Object.values(checks).every((s) => s === 'healthy');

    let maintenance = { enabled: false, message: null as string | null };
    try {
      const enabled = await this.redisService.get('maintenance:enabled');
      const message = await this.redisService.get('maintenance:message');
      maintenance = {
        enabled: enabled === '1',
        message: message || null,
      };
    } catch {
      // ignore — maintenance status is best-effort
    }

    const body = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks,
      maintenance,
    };

    res.status(isHealthy ? 200 : 503).json(body);
  }
}
