import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  tokenType?: 'access' | 'refresh';
  jti?: string;
  iat?: number;
  exp?: number;
}
