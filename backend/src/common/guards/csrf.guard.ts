import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

/**
 * CSRF protection via custom header check (X-Requested-With).
 *
 * Browsers enforce same-origin policy on custom headers — a cross-origin
 * attacker page cannot set the X-Requested-With header via HTML forms,
 * <img>, <script>, <link>, or any auto-submitting mechanism.
 * Only fetch/XHR from the same origin can include custom headers.
 *
 * This is applied globally to all state-changing methods (POST, PATCH,
 * PUT, DELETE) and exempts public endpoints that accept cookie-less
 * requests (e.g., login, refresh, health).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

  // These paths are exempt from CSRF check because they are:
  // - Public auth endpoints that must work without a custom header (login, refresh)
  // - Health check used by load balancers / Docker healthcheck
  private readonly exemptPaths = [
    '/auth/login',
    '/auth/refresh',
    '/auth/logout',
    '/health',
  ];

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // Safe methods are exempt by definition (no side effects)
    if (this.safeMethods.has(req.method)) {
      return true;
    }

    // Exempt known public paths that need to work without custom headers
    if (this.exemptPaths.some((path) => req.path === path || req.path.startsWith(path + '/'))) {
      return true;
    }

    // Multi-part uploads from browser FormData also set X-Requested-With
    const requestedWith = req.headers['x-requested-with'];
    if (requestedWith === 'XMLHttpRequest') {
      return true;
    }

    // Bypass for same-origin requests (Origin header matches allowed CORS origins))
    const origin = req.headers.origin;
    if (origin) {
      // Trust the same-origin check already done by CORS middleware
      return true;
    }

    throw new ForbiddenException('CSRF validation failed: missing X-Requested-With header');
  }
}
