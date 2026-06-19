import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  jti?: string;
  iat?: number;
  exp?: number;
}
