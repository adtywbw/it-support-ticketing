import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { MaintenanceGuard } from './maintenance.guard';
import { RedisService } from '../../redis/redis.service';

function createMockContext(
  url: string,
  authHeader?: string,
  options: { isPublic?: boolean } = {},
): ExecutionContext {
  const handler = jest.fn();
  const controllerClass = class TestController {};
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        url,
        path: url,
        headers: authHeader ? { authorization: authHeader } : {},
      }),
    }),
    getHandler: () => handler,
    getClass: () => controllerClass,
    __isPublic: options.isPublic ?? false,
  } as unknown as ExecutionContext;
}

describe('MaintenanceGuard', () => {
  let guard: MaintenanceGuard;
  let redis: { mget: jest.Mock; get: jest.Mock };
  let jwtService: { verifyAsync: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    redis = {
      mget: jest.fn(),
      get: jest.fn(),
    };
    jwtService = {
      verifyAsync: jest.fn(),
    };
    reflector = {
      getAllAndOverride: jest.fn((_key, _targets) => false),
    };
    guard = new MaintenanceGuard(
      redis as unknown as RedisService,
      jwtService as unknown as JwtService,
      reflector as unknown as Reflector,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('when maintenance is disabled', () => {
    it('allows all requests', async () => {
      redis.mget.mockResolvedValue(['0', null]);

      const result = await guard.canActivate(createMockContext('/tickets'));

      expect(result).toBe(true);
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });
  });

  describe('allowed paths during maintenance', () => {
    it('allows /health', async () => {
      redis.mget.mockResolvedValue(['1', 'maintenance message']);

      const result = await guard.canActivate(createMockContext('/health'));

      expect(result).toBe(true);
    });

    it('allows /maintenance/*', async () => {
      redis.mget.mockResolvedValue(['1', 'maintenance message']);

      const result = await guard.canActivate(createMockContext('/maintenance/backups'));

      expect(result).toBe(true);
    });

    it('allows /auth/*', async () => {
      redis.mget.mockResolvedValue(['1', 'maintenance message']);

      const result = await guard.canActivate(createMockContext('/auth/login'));

      expect(result).toBe(true);
    });
  });

  describe('when maintenance is enabled', () => {
    beforeEach(() => {
      redis.mget.mockResolvedValue(['1', 'Sedang maintenance']);
    });

    it('allows admin with valid access token', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        role: Role.Admin,
        tokenType: 'access',
      });

      const result = await guard.canActivate(
        createMockContext('/tickets', 'Bearer admin-token'),
      );

      expect(result).toBe(true);
    });

    it('blocks non-admin with valid access token', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-2',
        role: Role.EndUser,
        tokenType: 'access',
      });

      await expect(
        guard.canActivate(createMockContext('/tickets', 'Bearer user-token')),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('blocks ITSupport with valid access token', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-3',
        role: Role.ITSupport,
        tokenType: 'access',
      });

      await expect(
        guard.canActivate(createMockContext('/tickets', 'Bearer support-token')),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('blocks requests with no authorization header', async () => {
      await expect(
        guard.canActivate(createMockContext('/tickets')),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('allows requests with expired/invalid token (let JwtAuthGuard handle 401)', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      const result = await guard.canActivate(
        createMockContext('/tickets', 'Bearer expired-token'),
      );

      expect(result).toBe(true);
    });

    it('blocks public non-allowlisted routes with expired/invalid token', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(
        guard.canActivate(createMockContext('/faqs', 'Bearer expired-token', { isPublic: true })),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('allows protected routes with expired/invalid token so JwtAuthGuard can return 401', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      const result = await guard.canActivate(
        createMockContext('/tickets', 'Bearer expired-token'),
      );

      expect(result).toBe(true);
    });

    it('includes maintenance message in the 503 response', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-2',
        role: Role.EndUser,
        tokenType: 'access',
      });

      try {
        await guard.canActivate(createMockContext('/tickets', 'Bearer user-token'));
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceUnavailableException);
        const response = (e as ServiceUnavailableException).getResponse() as Record<string, unknown>;
        expect(response.code).toBe('MAINTENANCE');
        expect(response.message).toBe('Sedang maintenance');
      }
    });
  });

  describe('when Redis is unreachable', () => {
    it('fails open (allows request)', async () => {
      redis.mget.mockRejectedValue(new Error('Redis connection refused'));

      const result = await guard.canActivate(createMockContext('/tickets'));

      expect(result).toBe(true);
    });
  });
});
