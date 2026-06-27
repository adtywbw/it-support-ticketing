import {
  Controller,
  Post,
  Body,
  UseGuards,
  Res,
  Req,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

const REFRESH_COOKIE = 'refresh_token';

function getCookieSecure(req: Request): boolean {
  if (process.env.COOKIE_SECURE !== undefined) {
    return process.env.COOKIE_SECURE === 'true';
  }
  return req.headers['x-forwarded-proto'] === 'https';
}

function getRefreshCookieMaxAge(): number {
  const expiryStr = process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d';
  const match = expiryStr.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * (multipliers[unit] || multipliers.d);
}

function getRefreshCookieOptions(req: Request, maxAge?: number) {
  return {
    httpOnly: true,
    secure: getCookieSecure(req),
    sameSite: 'strict' as const,
    path: '/api/auth',
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);
    res.cookie(REFRESH_COOKIE, result.refreshToken, getRefreshCookieOptions(req, getRefreshCookieMaxAge()));
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('refresh')
  @Public()
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      return { accessToken: null, user: null };
    }
    const result = await this.authService.refresh(token);
    res.cookie(REFRESH_COOKIE, result.refreshToken, getRefreshCookieOptions(req, getRefreshCookieMaxAge()));
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: { id: string },
    @Body() changePasswordDto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.changePassword(
      user.id,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
    res.clearCookie(REFRESH_COOKIE, getRefreshCookieOptions(req));
    return { message: 'Password changed successfully' };
  }

  @Post('logout')
  @Public()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      await this.authService.revokeRefreshToken(token);
    }
    res.clearCookie(REFRESH_COOKIE, getRefreshCookieOptions(req));
    return { message: 'Logged out successfully' };
  }
}
