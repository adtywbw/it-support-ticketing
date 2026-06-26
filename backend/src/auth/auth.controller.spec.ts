import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: any;

  const mockAuthService = {
    login: jest.fn(),
    refresh: jest.fn(),
    revokeRefreshToken: jest.fn(),
    changePassword: jest.fn(),
  };

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret-key-for-controller-1234';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: JwtService, useValue: new JwtService({ secret: process.env.JWT_SECRET }) },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.JWT_SECRET;
    delete process.env.COOKIE_SECURE;
  });

  describe('logout()', () => {
    it('should revoke refresh cookie and return success message', async () => {
      const mockReq = {
        cookies: { refresh_token: 'valid-refresh-token' },
        headers: { 'x-forwarded-proto': 'https' },
      } as unknown as Request;

      const mockRes = {
        clearCookie: jest.fn(),
      } as unknown as Response;

      authService.revokeRefreshToken.mockResolvedValue(undefined);

      const result = await controller.logout(mockReq, mockRes);

      expect(authService.revokeRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.objectContaining({
          httpOnly: true,
          path: '/api/auth',
        }),
      );
      expect(result).toEqual({ message: 'Logged out successfully' });
    });

    it('should work without refresh token cookie (no access token required)', async () => {
      const mockReq = {
        cookies: {},
        headers: { 'x-forwarded-proto': 'http' },
      } as unknown as Request;

      const mockRes = {
        clearCookie: jest.fn(),
      } as unknown as Response;

      const result = await controller.logout(mockReq, mockRes);

      expect(authService.revokeRefreshToken).not.toHaveBeenCalled();
      expect(mockRes.clearCookie).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Logged out successfully' });
    });

    it('should revoke token even when cookie is undefined', async () => {
      const mockReq = {
        cookies: undefined,
        headers: {},
      } as unknown as Request;

      const mockRes = {
        clearCookie: jest.fn(),
      } as unknown as Response;

      const result = await controller.logout(mockReq, mockRes);

      expect(authService.revokeRefreshToken).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('login()', () => {
    it('should set refresh cookie and return accessToken + user (no refreshToken in response)', async () => {
      const mockReq = {
        headers: { 'x-forwarded-proto': 'https' },
      } as unknown as Request;

      const mockRes = {
        cookie: jest.fn(),
      } as unknown as Response;

      const authResult = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: 'user-1', email: 'test@test.com', role: 'EndUser', name: 'Test' },
      };

      authService.login.mockResolvedValue(authResult);

      const result = await controller.login(
        { email: 'test@test.com', password: 'password' },
        mockReq,
        mockRes,
      );

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token',
        expect.objectContaining({ httpOnly: true, path: '/api/auth' }),
      );
      expect(result).toEqual({
        accessToken: 'access-token',
        user: { id: 'user-1', email: 'test@test.com', role: 'EndUser', name: 'Test' },
      });
      expect(result).not.toHaveProperty('refreshToken');
    });
  });

  describe('refresh()', () => {
    it('should return null accessToken when no refresh cookie', async () => {
      const mockReq = {
        cookies: {},
        headers: {},
      } as unknown as Request;

      const mockRes = {
        cookie: jest.fn(),
      } as unknown as Response;

      const result = await controller.refresh(mockReq, mockRes);

      expect(result).toEqual({ accessToken: null, user: null });
    });

    it('should call authService.refresh with cookie value', async () => {
      const mockReq = {
        cookies: { refresh_token: 'some-token' },
        headers: {},
      } as unknown as Request;

      const mockRes = {
        cookie: jest.fn(),
      } as unknown as Response;

      const authResult = {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        user: { id: 'user-1', email: 'test@test.com', role: 'EndUser', name: 'Test' },
      };

      authService.refresh.mockResolvedValue(authResult);

      const result = await controller.refresh(mockReq, mockRes);

      expect(authService.refresh).toHaveBeenCalledWith('some-token');
      expect(result).toEqual({
        accessToken: 'new-access',
        user: { id: 'user-1', email: 'test@test.com', role: 'EndUser', name: 'Test' },
      });
    });
  });
});
