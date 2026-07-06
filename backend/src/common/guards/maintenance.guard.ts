import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { RedisService } from '../../redis/redis.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

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
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    if (this.isAllowedDuringMaintenance(req)) return true;

    const cached = await this.getMaintenanceCached().catch(() => null);
    if (!cached) return true;

    if (!cached.enabled) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) === true;

    if (await this.shouldAllowDuringMaintenance(req, isPublic)) return true;

    throw new ServiceUnavailableException({
      statusCode: 503,
      message: cached.message || 'The system is undergoing maintenance. Please try again later.',
      error: 'Service Unavailable',
      code: 'MAINTENANCE',
    });
  }

  /**
   * Returns true if the request should be allowed through during maintenance:
   * - Admin JWT → allowed
   * - Invalid/expired JWT on a protected route → allow (let JwtAuthGuard handle 401)
   * - Invalid/expired JWT on a public non-allowlisted route → block (return false = 503)
   * - No token → block
   */
  private async shouldAllowDuringMaintenance(req: Request, isPublic: boolean): Promise<boolean> {
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
      // Invalid/expired token: block if this is a public route (no JwtAuthGuard fallback),
      // allow if protected (JwtAuthGuard will return 401 with proper message)
      return !isPublic;
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
