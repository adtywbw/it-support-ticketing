import { JwtModuleAsyncOptions } from '@nestjs/jwt';
import type { StringValue } from 'ms';

const secret = process.env.JWT_SECRET;

if (!secret || secret.length < 32) {
  throw new Error(
    'JWT_SECRET environment variable must be set and at least 32 characters long. ' +
    'Generate one with: openssl rand -base64 48',
  );
}

/** Shared verify config — algorithm pinned to HS256. */
export const jwtModuleConfig: JwtModuleAsyncOptions = {
  useFactory: () => ({
    secret,
    verifyOptions: { algorithms: ['HS256'] },
  }),
};

/** Sign + verify config, used by AuthModule which also issues tokens. */
export const jwtModuleConfigWithSigning: JwtModuleAsyncOptions = {
  useFactory: () => ({
    secret,
    signOptions: {
      expiresIn: (process.env.JWT_ACCESS_TOKEN_EXPIRY || '15m') as StringValue,
      algorithm: 'HS256',
    },
    verifyOptions: { algorithms: ['HS256'] },
  }),
};
