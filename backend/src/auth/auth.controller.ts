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
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);
    const isSecure = req.headers['x-forwarded-proto'] === 'https';
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      return { accessToken: null, user: null };
    }
    const result = await this.authService.refresh(token);
    const isSecure = req.headers['x-forwarded-proto'] === 'https';
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ITSupport, Role.Admin)
  async changePassword(
    @CurrentUser() user: { id: string },
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(
      user.id,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
    return { message: 'Password changed successfully' };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      await this.authService.revokeRefreshToken(token);
    }
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { message: 'Logged out successfully' };
  }
}
