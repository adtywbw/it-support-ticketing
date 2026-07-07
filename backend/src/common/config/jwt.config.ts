import { JwtModuleAsyncOptions } from '@nestjs/jwt';
import type { StringValue } from 'ms';

let _secret: string | null = null;

/**
 * Returns the validated JWT_SECRET.
 * Lazily evaluated and cached so tests can set process.env.JWT_SECRET
 * before the first call. Use in JwtModule async factories.
 */
export function getJwtSecret(): string {
  if (_secret) return _secret;
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'JWT_SECRET environment variable must be set and at least 32 characters long. ' +
      'Generate one with: openssl rand -base64 48',
    );
  }
  _secret = s;
  return _secret;
}

/** Shared verify config — algorithm pinned to HS256. */
export const jwtModuleConfig: JwtModuleAsyncOptions = {
  useFactory: () => ({
    secret: getJwtSecret(),
    verifyOptions: { algorithms: ['HS256'] },
  }),
};

/** Sign + verify config, used by AuthModule which also issues tokens. */
export const jwtModuleConfigWithSigning: JwtModuleAsyncOptions = {
  useFactory: () => ({
    secret: getJwtSecret(),
    signOptions: {
      expiresIn: (process.env.JWT_ACCESS_TOKEN_EXPIRY || '15m') as StringValue,
      algorithm: 'HS256',
    },
    verifyOptions: { algorithms: ['HS256'] },
  }),
};
