import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { NotificationsGateway } from '../notifications.gateway';
import { UserRepository } from '../../common/repositories/user.repository';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { Role } from '@prisma/client';

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let jwtService: any;
  let userRepository: any;

  const mockJwtService = {
    verify: jest.fn(),
  };

  const mockUserRepository = {
    getForValidation: jest.fn(),
  };

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret-key-for-gateway-unit-tests-1234';
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: UserRepository, useValue: mockUserRepository },
      ],
    }).compile();

    gateway = module.get<NotificationsGateway>(NotificationsGateway);
    jwtService = module.get(JwtService);
    userRepository = module.get(UserRepository);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete process.env.JWT_SECRET;
  });

  function makeMockSocket(id: string) {
    return {
      id,
      handshake: { auth: { token: 'valid-token' } },
      disconnect: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
    } as any;
  }

  function makePayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
    return {
      sub: 'user-1',
      email: 'user@test.com',
      role: Role.Admin,
      tokenType: 'access',
      ...overrides,
    };
  }

  describe('handleConnection — token validation', () => {
    it('should disconnect when no token provided', async () => {
      const client = makeMockSocket('sock-1');
      client.handshake.auth = {};

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect when token is not a string', async () => {
      const client = makeMockSocket('sock-1');
      client.handshake.auth = { token: 123 };

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect when token type is refresh', async () => {
      jwtService.verify.mockReturnValue(makePayload({ tokenType: 'refresh' }));
      userRepository.getForValidation.mockResolvedValue({ isActive: true });

      const client = makeMockSocket('sock-1');
      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect when user is inactive', async () => {
      jwtService.verify.mockReturnValue(makePayload());
      userRepository.getForValidation.mockResolvedValue({ isActive: false });

      const client = makeMockSocket('sock-1');
      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect when user not found', async () => {
      jwtService.verify.mockReturnValue(makePayload());
      userRepository.getForValidation.mockResolvedValue(null);

      const client = makeMockSocket('sock-1');
      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect on invalid JWT', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const client = makeMockSocket('sock-1');
      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should join user room when valid', async () => {
      jwtService.verify.mockReturnValue(makePayload());
      userRepository.getForValidation.mockResolvedValue({ isActive: true });

      const client = makeMockSocket('sock-1');
      await gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith('user:user-1');
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(jwtService.verify).toHaveBeenCalledWith('valid-token', {
        secret: process.env.JWT_SECRET!,
        algorithms: ['HS256'],
      });
    });
  });

  describe('handleConnection — token expiry', () => {
    it('should disconnect immediately if token is already expired', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 60;
      jwtService.verify.mockReturnValue(makePayload({ exp: pastExp }));
      userRepository.getForValidation.mockResolvedValue({ isActive: true });

      const client = makeMockSocket('sock-1');
      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should schedule disconnect at token expiry', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      jwtService.verify.mockReturnValue(makePayload({ exp: futureExp }));
      userRepository.getForValidation.mockResolvedValue({ isActive: true });

      const client = makeMockSocket('sock-1');
      await gateway.handleConnection(client);

      // Should not disconnect immediately
      expect(client.disconnect).not.toHaveBeenCalled();
      // A timer should be scheduled
      expect((gateway as any).expiryTimers.has('sock-1')).toBe(true);

      // Advance time to expiry — should disconnect
      jest.advanceTimersByTime(3600 * 1000);
      expect(client.disconnect).toHaveBeenCalled();
      expect((gateway as any).expiryTimers.has('sock-1')).toBe(false);
    });

    it('should not schedule timer when exp is undefined', async () => {
      jwtService.verify.mockReturnValue(makePayload());
      userRepository.getForValidation.mockResolvedValue({ isActive: true });

      const client = makeMockSocket('sock-1');
      await gateway.handleConnection(client);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect((gateway as any).expiryTimers.has('sock-1')).toBe(false);
    });
  });

  describe('handleDisconnect — timer cleanup', () => {
    it('should clear expiry timer on disconnect', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      jwtService.verify.mockReturnValue(makePayload({ exp: futureExp }));
      userRepository.getForValidation.mockResolvedValue({ isActive: true });

      const client = makeMockSocket('sock-1');
      await gateway.handleConnection(client);

      expect((gateway as any).expiryTimers.has('sock-1')).toBe(true);

      gateway.handleDisconnect(client);

      expect((gateway as any).expiryTimers.has('sock-1')).toBe(false);
    });

    it('should handle disconnect when no timer exists', () => {
      const client = makeMockSocket('sock-1');
      expect(() => gateway.handleDisconnect(client)).not.toThrow();
    });
  });
});
