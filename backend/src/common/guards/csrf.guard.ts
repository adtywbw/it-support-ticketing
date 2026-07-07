import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { getCorsOrigins } from '../utils/env-validation.util';

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
 *
 * Origin header bypass: requests from allowed CORS origins (same-origin
 * or explicitly configured) are trusted without X-Requested-Whitelist
 * because the browser's CORS enforcement prevents cross-origin
 * JavaScript from setting custom headers or reading responses.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
  private readonly allowedOrigins: ReadonlySet<string>;

  // These paths are exempt from CSRF check because they are:
  // - Public auth endpoints that must work without a custom header (login, refresh)
  // - Health check used by load balancers / Docker healthcheck
  private readonly exemptPaths = [
    '/auth/login',
    '/auth/refresh',
    '/auth/logout',
    '/health',
  ];

  constructor() {
    this.allowedOrigins = new Set(getCorsOrigins());
  }

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

    // Requests with X-Requested-With header pass (browser fetch/XHR)
    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return true;
    }

    // Allow same-origin and configured CORS origins to bypass the custom
    // header check. The browser's CORS enforcement ensures only pages
    // served from these origins can make requests that include credentials.
    const origin = req.headers.origin;
    if (origin && this.allowedOrigins.has(origin)) {
      return true;
    }

    throw new ForbiddenException('CSRF validation failed: missing X-Requested-With header');
  }
}
