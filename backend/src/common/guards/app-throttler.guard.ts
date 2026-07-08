import { Injectable, ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { Request } from "express";

/** Request augmented by Passport after JWT verification. */
type AuthenticatedRequest = Request & { user?: { id: string } };

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
  protected async getTracker(req: AuthenticatedRequest): Promise<string> {
    const id = req?.user?.id;
    if (id) {
      return `user:${id}`;
    }
    return `ip:${req.ip}`;
  }
}
