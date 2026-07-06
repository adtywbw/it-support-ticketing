import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { LoginDto } from './dto/login.dto';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let usersService: any;
  let redisService: any;

  const mockUsersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    findByIdWithPassword: jest.fn(),
    update: jest.fn(),
  };

  const mockRedisService = {
    set: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn(),
    deleteByPattern: jest.fn(),
    incr: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(undefined),
    eval: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret-key-for-unit-tests-1234';
    process.env.JWT_REFRESH_TOKEN_EXPIRY = '7d';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: new JwtService({ secret: process.env.JWT_SECRET }) },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();
    await module.init();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    usersService = module.get(UsersService);
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_TOKEN_EXPIRY;
  });

  describe('refresh()', () => {
    const mockUser = {
      id: 'user-1',
      email: 'test@test.com',
      role: 'EndUser',
      name: 'Test User',
      isActive: true,
    };

    it('should reject access token used with refresh() (AUTH-01: tokenType=access)', async () => {
      const accessPayload = {
        sub: 'user-1',
        email: 'test@test.com',
        role: 'EndUser',
        tokenType: 'access' as const,
      };
      const accessToken = jwtService.sign(accessPayload, { expiresIn: '15m' });

      await expect(service.refresh(accessToken)).rejects.toThrow(UnauthorizedException);
      await expect(service.refresh(accessToken)).rejects.toThrow('Invalid refresh token');
    });

    it('should reject token without tokenType claim (old-style token)', async () => {
      const oldStylePayload = {
        sub: 'user-1',
        email: 'test@test.com',
        role: 'EndUser',
      };
      const oldToken = jwtService.sign(oldStylePayload, { expiresIn: '7d' });

      await expect(service.refresh(oldToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject refresh token without jti', async () => {
      const payloadNoJti = {
        sub: 'user-1',
        email: 'test@test.com',
        role: 'EndUser',
        tokenType: 'refresh' as const,
      };
      const token = jwtService.sign(payloadNoJti, { expiresIn: '7d' });

      await expect(service.refresh(token)).rejects.toThrow('Invalid refresh token');
    });

    it('should reject token not stored in Redis', async () => {
      const payload = {
        sub: 'user-1',
        email: 'test@test.com',
        role: 'EndUser',
        tokenType: 'refresh' as const,
        jti: 'token-jti',
      };
      const token = jwtService.sign(payload, { expiresIn: '7d' });
      redisService.get.mockResolvedValue(null);

      await expect(service.refresh(token)).rejects.toThrow('Refresh token has been revoked');
    });

    it('should reject token that does not match stored value', async () => {
      const payload = {
        sub: 'user-1',
        email: 'test@test.com',
        role: 'EndUser',
        tokenType: 'refresh' as const,
        jti: 'token-jti',
      };
      const token = jwtService.sign(payload, { expiresIn: '7d' });
      redisService.get.mockResolvedValue('different-token-value');

      await expect(service.refresh(token)).rejects.toThrow('Refresh token has been revoked');
    });

    it('should reject token when user is inactive', async () => {
      const payload = {
        sub: 'user-1',
        email: 'test@test.com',
        role: 'EndUser',
        tokenType: 'refresh' as const,
        jti: 'inactive-jti',
      };
      const token = jwtService.sign(payload, { expiresIn: '7d' });
      redisService.get.mockResolvedValue(token);
      usersService.findById.mockResolvedValue({ ...mockUser, isActive: false });

      await expect(service.refresh(token)).rejects.toThrow('User not found or inactive');
    });

    it('should accept valid refresh token with tokenType=refresh and valid Redis entry', async () => {
      const payload = {
        sub: 'user-1',
        email: 'test@test.com',
        role: 'EndUser',
        tokenType: 'refresh' as const,
        jti: 'valid-jti',
      };
      const token = jwtService.sign(payload, { expiresIn: '7d' });
      redisService.get.mockResolvedValue(token);
      redisService.eval.mockResolvedValue(token);
      usersService.findById.mockResolvedValue(mockUser);
      const verifySpy = jest.spyOn(jwtService, 'verify');

      const result = await service.refresh(token);

      expect(verifySpy).toHaveBeenCalledWith(token, {
        secret: process.env.JWT_SECRET!,
        algorithms: ['HS256'],
      });
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      // Should call GET (step 1) before GETDEL (step 2, atomic consumption)
      expect(redisService.get).toHaveBeenCalledWith('refresh:user-1:valid-jti');
      expect(redisService.eval).toHaveBeenCalledWith(
        expect.any(String),
        ['refresh:user-1:valid-jti'],
        [],
      );
      expect(usersService.findById).toHaveBeenCalledWith('user-1');
    });
  });

  describe('login()', () => {
    it('should generate tokens with correct tokenType claims', async () => {
      const loginDto: LoginDto = { email: 'test@test.com', password: 'password123' };
      const mockUser = {
        id: 'user-1',
        email: 'test@test.com',
        role: 'EndUser',
        name: 'Test User',
        password: '$2b$12$hashedpassword',
        isActive: true,
      };

      redisService.get.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(mockUser);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');

      const accessDecoded = jwtService.verify(result.accessToken);
      expect(accessDecoded.tokenType).toBe('access');
      expect(accessDecoded.sub).toBe('user-1');

      const refreshDecoded = jwtService.verify(result.refreshToken);
      expect(refreshDecoded.tokenType).toBe('refresh');
      expect(refreshDecoded.jti).toBeDefined();
      expect(refreshDecoded.sub).toBe('user-1');

      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^refresh:user-1:/),
        result.refreshToken,
        expect.any(Number),
      );
    });
  });

  describe('revokeRefreshToken()', () => {
    it('should silently return for invalid token', async () => {
      await expect(service.revokeRefreshToken('invalid-token')).resolves.toBeUndefined();
      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('should delete Redis key for valid refresh token', async () => {
      const payload = {
        sub: 'user-1',
        email: 'test@test.com',
        role: 'EndUser',
        tokenType: 'refresh' as const,
        jti: 'revoke-jti',
      };
      const token = jwtService.sign(payload, { expiresIn: '7d' });
      const verifySpy = jest.spyOn(jwtService, 'verify');

      await service.revokeRefreshToken(token);

      expect(verifySpy).toHaveBeenCalledWith(token, {
        secret: process.env.JWT_SECRET!,
        algorithms: ['HS256'],
      });
      expect(redisService.del).toHaveBeenCalledWith('refresh:user-1:revoke-jti');
    });

    it('should not delete Redis key for access token', async () => {
      const payload = {
        sub: 'user-1',
        email: 'test@test.com',
        role: 'EndUser',
        tokenType: 'access' as const,
      };
      const token = jwtService.sign(payload, { expiresIn: '15m' });

      await service.revokeRefreshToken(token);

      expect(redisService.del).not.toHaveBeenCalled();
    });
  });
});
