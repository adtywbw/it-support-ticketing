import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AuthResponse } from './interfaces/auth-response.interface';

const MAX_FAILED_ATTEMPTS = 10;
const LOCK_DURATION_SEC = 900;

@Injectable()
export class AuthService {
  private readonly refreshTokenExpiryMs: number;
  private readonly dummyHash: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {
    const expiryStr = process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d';
    this.refreshTokenExpiryMs = this.parseExpiryToMs(expiryStr);
    this.dummyHash = bcrypt.hashSync('dummy-password-for-timing', 12);
  }

  private parseExpiryToMs(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return value * (multipliers[unit] || multipliers.d);
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
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.tokenType !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const storedToken = await this.redisService.get(
      `refresh:${payload.sub}:${payload.jti}`,
    );
    if (!storedToken || storedToken !== refreshToken) {
      await this.redisService.del(
        `refresh:${payload.sub}:${payload.jti}`,
      );
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    await this.redisService.del(
      `refresh:${payload.sub}:${payload.jti}`,
    );

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
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
    await this.revokeAllRefreshTokens(userId);
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
        expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d',
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
    const count = await this.redisService.incr(key);
    if (count === 1) {
      await this.redisService.expire(key, LOCK_DURATION_SEC);
    }
    if (count >= MAX_FAILED_ATTEMPTS) {
      const lockKey = `login:locked:${email}`;
      await this.redisService.set(lockKey, '1', LOCK_DURATION_SEC);
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
