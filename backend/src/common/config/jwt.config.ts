import { JwtModuleAsyncOptions } from '@nestjs/jwt';
import type { StringValue } from 'ms';

const secret = process.env.JWT_SECRET!;

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
