import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

/**
 * Custom ThrottlerGuard that uses the authenticated user's ID as the
 * rate-limit key instead of the raw IP address.
 *
 * - Authenticated requests → throttled by `user:{userId}:{route}`
 * - Unauthenticated / public requests → throttled by `ip:{remoteAddr}`
 *
 * This prevents one user's requests from affecting another user's quota
 * when they share the same NAT IP (office, campus, etc.).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const user = (req as any).user;
    if (user?.id) {
      return `user:${user.id}`;
    }
    return `ip:${req.ip}`;
  }
}
