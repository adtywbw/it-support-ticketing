import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RedisService } from '../../redis/redis.service';

const MAINTENANCE_KEY = 'maintenance:enabled';
const MAINTENANCE_MESSAGE_KEY = 'maintenance:message';
const SKIP_MAINTENANCE_KEY = 'skipMaintenance';

@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_MAINTENANCE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const enabled = await this.redis.get(MAINTENANCE_KEY);
    if (enabled !== '1') return true;

    const req = context.switchToHttp().getRequest<Request>();

    if (this.isAllowedDuringMaintenance(req)) return true;

    const message = await this.redis.get(MAINTENANCE_MESSAGE_KEY);
    const exception = new ServiceUnavailableException(
      message || 'System sedang dalam pemeliharaan. Silakan coba lagi beberapa saat.',
    );
    exception.getResponse = () => ({
      statusCode: 503,
      message: message || 'System sedang dalam pemeliharaan. Silakan coba lagi beberapa saat.',
      error: 'Service Unavailable',
      code: 'MAINTENANCE',
    });
    throw exception;
  }

  private isAllowedDuringMaintenance(req: Request): boolean {
    const url = req.url;

    if (url === '/health') return true;
    if (url.startsWith('/maintenance/')) return true;
    if (url.startsWith('/auth/')) return true;

    return false;
  }
}
