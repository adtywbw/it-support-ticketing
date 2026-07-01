import { Request } from 'express';
import { parseExpiryToMs } from '../common/utils/time.util';

const REFRESH_COOKIE = 'refresh_token';

export function getCookieSecure(req: Request): boolean {
  if (process.env.COOKIE_SECURE !== undefined) {
    return process.env.COOKIE_SECURE === 'true';
  }
  return req.headers['x-forwarded-proto'] === 'https';
}

export function getRefreshCookieMaxAge(): number {
  const expiryStr = process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d';
  return parseExpiryToMs(expiryStr);
}

export function getRefreshCookieOptions(req: Request, maxAge?: number) {
  return {
    httpOnly: true,
    secure: getCookieSecure(req),
    sameSite: 'strict' as const,
    path: '/api/auth',
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

export { REFRESH_COOKIE };
