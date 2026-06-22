import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AuthResponse } from './interfaces/auth-response.interface';

@Injectable()
export class AuthService {
  private readonly refreshTokenExpiryMs: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {
    this.refreshTokenExpiryMs = 7 * 24 * 60 * 60 * 1000;
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

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

    const storedToken = await this.redisService.get(
      `refresh:${payload.sub}:${payload.jti}`,
    );
    if (!storedToken) {
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

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as JwtPayload['role'],
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(
      { ...payload, jti: tokenId },
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
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }
}
