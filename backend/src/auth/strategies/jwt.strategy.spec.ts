import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';
import { UserRepository } from '../../common/repositories/user.repository';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let userRepository: { findById: jest.Mock };

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key-for-unit-tests-1234';
    userRepository = { findById: jest.fn() };
    strategy = new JwtStrategy(userRepository as unknown as UserRepository);
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('rejects non-access tokens', async () => {
    await expect(strategy.validate({
      sub: 'user-1',
      email: 'user@example.com',
      role: Role.Admin,
      tokenType: 'refresh',
    })).rejects.toThrow(UnauthorizedException);
  });

  it('rejects missing users', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(strategy.validate({
      sub: 'user-1',
      email: 'user@example.com',
      role: Role.Admin,
      tokenType: 'access',
    })).rejects.toThrow(UnauthorizedException);
  });

  it('rejects inactive users', async () => {
    userRepository.findById.mockResolvedValue({ id: 'user-1', isActive: false });

    await expect(strategy.validate({
      sub: 'user-1',
      email: 'user@example.com',
      role: Role.Admin,
      tokenType: 'access',
    })).rejects.toThrow(UnauthorizedException);
  });

  it('converts repository errors to UnauthorizedException', async () => {
    userRepository.findById.mockRejectedValue(new Error('database unavailable'));

    await expect(strategy.validate({
      sub: 'user-1',
      email: 'user@example.com',
      role: Role.Admin,
      tokenType: 'access',
    })).rejects.toThrow(UnauthorizedException);
  });
});
