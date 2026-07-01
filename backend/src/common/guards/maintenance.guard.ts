import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { RedisService } from '../../redis/redis.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

const MAINTENANCE_KEY = 'maintenance:enabled';
const MAINTENANCE_MESSAGE_KEY = 'maintenance:message';

@Injectable()
export class MaintenanceGuard implements CanActivate {
  private cachedUntil = 0;
  private cachedEnabled = false;
  private cachedMessage: string | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    if (this.isAllowedDuringMaintenance(req)) return true;

    let enabled = false;
    let message: string | null = null;
    try {
      const cached = await this.getMaintenanceCached();
      enabled = cached.enabled;
      message = cached.message;
    } catch {
      return true;
    }

    if (!enabled) return true;

    if (await this.isAdminRequest(req)) return true;

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

  private async isAdminRequest(req: Request): Promise<boolean> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return false;

    const token = authHeader.slice(7);
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_SECRET,
        algorithms: ['HS256'],
      });
      return payload.role === Role.Admin;
    } catch {
      return true;
    }
  }

  private async getMaintenanceCached(): Promise<{ enabled: boolean; message: string | null }> {
    const now = Date.now();
    if (now < this.cachedUntil) {
      return { enabled: this.cachedEnabled, message: this.cachedMessage };
    }

    const [enabled, message] = await this.redis.mget([MAINTENANCE_KEY, MAINTENANCE_MESSAGE_KEY]);
    this.cachedEnabled = enabled === '1';
    this.cachedMessage = message || null;
    this.cachedUntil = now + 2000;

    return { enabled: this.cachedEnabled, message: this.cachedMessage };
  }

  private isAllowedDuringMaintenance(req: Request): boolean {
    const url = req.path ?? req.url;

    if (url === '/health') return true;
    if (url.startsWith('/maintenance/')) return true;
    if (url.startsWith('/auth/')) return true;

    return false;
  }
}
