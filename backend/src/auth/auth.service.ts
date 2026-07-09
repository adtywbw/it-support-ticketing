import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import type { StringValue } from 'ms';
import type { Request } from 'express';
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
  private readonly logger = new Logger(AuthService.name);
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

  async login(loginDto: LoginDto, req?: Request): Promise<AuthResponse> {
    const normalizedEmail = loginDto.email.toLowerCase().trim();
    await this.checkAccountLocked(normalizedEmail);

    const user = await this.validateUser(normalizedEmail, loginDto.password);
    if (!user) {
      await this.trackFailedLogin(normalizedEmail);
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.resetFailedLogin(normalizedEmail);
    return this.generateTokens(user, req);
  }

  async refresh(refreshToken: string, req?: Request): Promise<AuthResponse> {
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

    const refreshKey = `refresh:${payload.sub}:${payload.jti}`;

    // First validate that the token exists in Redis without consuming it.
    let storedValue: string | null;
    try {
      storedValue = await this.redisService.get(refreshKey) as string | null;
    } catch {
      throw new UnauthorizedException('Refresh token validation failed');
    }
    if (!storedValue) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // Handle both legacy plain-token format and new JSON-wrapped format.
    let storedToken: string;
    try {
      const parsed = JSON.parse(storedValue);
      if (parsed && typeof parsed === 'object' && parsed.token) {
        storedToken = parsed.token;
        // Validate device fingerprint if present.
        if (parsed.fp && req) {
          const currentFp = this.computeFingerprint(req);
          if (currentFp && parsed.fp !== currentFp) {
            // Fingerprint mismatch — revoke the token immediately to
            // prevent replay from a different device.
            await this.redisService.del(refreshKey).catch(() => {});
            throw new UnauthorizedException('Refresh token has been revoked');
          }
        }
      } else {
        storedToken = storedValue;
      }
    } catch {
      // If storedValue is not valid JSON, treat as plain token (backward compat).
      storedToken = storedValue;
    }

    if (storedToken !== refreshToken) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // Validate the user exists and is active BEFORE consuming the token.
    let user;
    try {
      user = await this.usersService.findById(payload.sub);
    } catch {
      throw new UnauthorizedException('User not found or inactive');
    }
    if (!user || !user.isActive) {
      // Token still valid — consume it so the revoked token cannot be
      // replayed if the user is reactivated later.
      await this.redisService.eval(
        GETDEL_SCRIPT,
        [refreshKey],
        [],
      ).catch(() => { /* Best-effort cleanup */ });
      throw new UnauthorizedException('User not found or inactive');
    }

    // All checks passed. Now atomically consume the token to prevent replay.
    let consumedToken: string | null;
    try {
      consumedToken = await this.redisService.eval(
        GETDEL_SCRIPT,
        [refreshKey],
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
    }, req);
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_SECRET!,
        algorithms: ['HS256'],
      });
    } catch {
      this.logger.debug('revokeRefreshToken called with invalid/unparseable token — silently ignored');
      return;
    }

    if (payload.tokenType === 'refresh' && payload.sub && payload.jti) {
      try {
        await this.redisService.del(`refresh:${payload.sub}:${payload.jti}`);
      } catch (err) {
        this.logger.warn(`Failed to revoke refresh token for user ${payload.sub}: ${err}`);
      }
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

  private async generateTokens(user: {
    id: string;
    email: string;
    role: string;
    name?: string;
  }, req?: Request): Promise<AuthResponse> {
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

    // Store refresh token + device fingerprint for replay protection.
    // The fingerprint is a hash of user-agent + client IP so a stolen
    // token cannot be used from a different device without detection.
    const refreshKey = `refresh:${user.id}:${tokenId}`;
    const fingerprint = this.computeFingerprint(req);
    const storedValue = fingerprint
      ? JSON.stringify({ token: refreshToken, fp: fingerprint })
      : refreshToken;

    await this.redisService.set(
      refreshKey,
      storedValue,
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
    let locked: string | null;
    try {
      locked = await this.redisService.get(`login:locked:${email}`);
    } catch (err) {
      this.logger.warn(`Redis unavailable during account lock check: ${err}`);
      return; // Fail open — allow login attempt if Redis is unreachable
    }
    if (locked) {
      throw new UnauthorizedException('Account temporarily locked due to too many failed attempts. Try again later.');
    }
  }

  private async resetFailedLogin(email: string): Promise<void> {
    try {
      await this.redisService.del(`login:failed:${email}`);
    } catch (err) {
      this.logger.warn(`Failed to reset failed login counter for ${email}: ${err}`);
    }
  }

  /**
   * Computes a device fingerprint hash from the request's User-Agent and
   * client IP. Used to bind refresh tokens to the originating device so
   * a stolen token cannot be replayed from a different environment.
   * Returns null when the request object is unavailable (e.g. programmatic
   * callers, CLI tools, or during testing).
   */
  private computeFingerprint(req?: Request): string | null {
    if (!req) return null;
    const ua = (req.headers['user-agent'] || '') as string;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.ip
      || '';
    if (!ua && !ip) return null;
    return crypto
      .createHash('sha256')
      .update(`${ua}::${ip}`)
      .digest('hex')
      .slice(0, 16);
  }
}
