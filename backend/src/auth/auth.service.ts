import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import type { StringValue } from 'ms';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AuthResponse } from './interfaces/auth-response.interface';
import { parseExpiryToMs } from '../common/utils/time.util';
import { appConfig } from '../common/config/app.config';

const GETDEL_SCRIPT = `
  local stored = redis.call('GET', KEYS[1])
  redis.call('DEL', KEYS[1])
  return stored
`;

const INCR_EXPIRE_SCRIPT = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return count
`;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly refreshTokenExpiryMs: number;
  private dummyHash!: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {
    const expiryStr = process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d';
    this.refreshTokenExpiryMs = parseExpiryToMs(expiryStr);
  }

  async onModuleInit() {
    this.dummyHash = await bcrypt.hash('dummy-password-for-timing', 12);
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const normalizedEmail = loginDto.email.toLowerCase().trim();
    await this.checkAccountLocked(normalizedEmail);

    const user = await this.validateUser(normalizedEmail, loginDto.password);
    if (!user) {
      await this.trackFailedLogin(normalizedEmail);
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.resetFailedLogin(normalizedEmail);
    return this.generateTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_SECRET!,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.tokenType !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // First validate that the token exists in Redis without consuming it.
    let storedToken: string | null;
    try {
      storedToken = await this.redisService.get(
        `refresh:${payload.sub}:${payload.jti}`,
      ) as string | null;
    } catch {
      throw new UnauthorizedException('Refresh token validation failed');
    }
    if (!storedToken || storedToken !== refreshToken) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // Validate the user exists and is active BEFORE consuming the token.
    // This prevents session loss if the DB is transiently unavailable.
    let user;
    try {
      user = await this.usersService.findById(payload.sub);
    } catch {
      throw new UnauthorizedException('User not found or inactive');
    }
    if (!user || !user.isActive) {
      // Token still valid - let validation consume it so the revoked
      // token cannot be replayed if the user is reactivated later.
      await this.redisService.eval(
        GETDEL_SCRIPT,
        [`refresh:${payload.sub}:${payload.jti}`],
        [],
      ).catch(() => { /* Best-effort cleanup */ });
      throw new UnauthorizedException('User not found or inactive');
    }

    // All checks passed. Now atomically consume the token to prevent replay.
    let consumedToken: string | null;
    try {
      consumedToken = await this.redisService.eval(
        GETDEL_SCRIPT,
        [`refresh:${payload.sub}:${payload.jti}`],
        [],
      ) as string | null;
    } catch {
      throw new UnauthorizedException('Refresh token validation failed');
    }
    if (!consumedToken) {
      // Token was consumed by a concurrent request (rare race).
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    return this.generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_SECRET!,
        algorithms: ['HS256'],
      });
    } catch {
      return;
    }

    if (payload.tokenType === 'refresh' && payload.sub && payload.jti) {
      await this.redisService.del(`refresh:${payload.sub}:${payload.jti}`);
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findByIdWithPassword(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    await this.usersService.update(userId, { password: newPassword });
    // Refresh tokens are revoked via the awaited user.password_changed
    // lifecycle event emitted by UsersService.update(). Do NOT call
    // revokeAllRefreshTokens directly here — that would SCAN+delete the
    // same keyspace twice.
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.redisService.deleteByPattern(`refresh:${userId}:*`);
  }

  @OnEvent('user.password_changed')
  async handlePasswordChanged(payload: { userId: string }) {
    await this.revokeAllRefreshTokens(payload.userId);
  }

  @OnEvent('user.deleted')
  async handleUserDeleted(payload: { userId: string }) {
    await this.revokeAllRefreshTokens(payload.userId);
  }

  @OnEvent('user.deactivated')
  async handleUserDeactivated(payload: { userId: string }) {
    await this.revokeAllRefreshTokens(payload.userId);
  }

  async logout(userId: string, tokenId: string): Promise<void> {
    await this.redisService.del(`refresh:${userId}:${tokenId}`);
  }

  private async generateTokens(user: {
    id: string;
    email: string;
    role: string;
    name?: string;
  }): Promise<AuthResponse> {
    const tokenId = uuidv4();

    const basePayload = {
      sub: user.id,
      email: user.email,
      role: user.role as JwtPayload['role'],
    };

    const accessToken = this.jwtService.sign({
      ...basePayload,
      tokenType: 'access' as const,
    });

    const refreshToken = this.jwtService.sign(
      {
        ...basePayload,
        tokenType: 'refresh' as const,
        jti: tokenId,
      },
      {
        secret: process.env.JWT_SECRET!,
        expiresIn: (process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d') as StringValue,
      },
    );

    await this.redisService.set(
      `refresh:${user.id}:${tokenId}`,
      refreshToken,
      Math.floor(this.refreshTokenExpiryMs / 1000),
    );

    const fullName = user.name || '';
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: fullName,
        firstName: fullName.split(' ').slice(0, -1).join(' ') || fullName,
        lastName: fullName.split(' ').pop() || '',
      },
    };
  }

  private async validateUser(
    email: string,
    password: string,
  ) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      await bcrypt.compare(password, this.dummyHash);
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    if (!user.isActive) {
      return null;
    }

    return user;
  }

  private async trackFailedLogin(email: string): Promise<void> {
    const key = `login:failed:${email}`;
    const count = await this.redisService.eval(
      INCR_EXPIRE_SCRIPT,
      [key],
      [String(appConfig.auth.lockDurationSec)],
    ) as number;
    if (count >= appConfig.auth.maxFailedAttempts) {
      const lockKey = `login:locked:${email}`;
      await this.redisService.set(lockKey, '1', appConfig.auth.lockDurationSec);
    }
  }

  private async checkAccountLocked(email: string): Promise<void> {
    const lockKey = `login:locked:${email}`;
    const locked = await this.redisService.get(lockKey);
    if (locked) {
      throw new UnauthorizedException('Account temporarily locked due to too many failed attempts. Try again later.');
    }
  }

  private async resetFailedLogin(email: string): Promise<void> {
    const key = `login:failed:${email}`;
    await this.redisService.del(key);
  }
}
