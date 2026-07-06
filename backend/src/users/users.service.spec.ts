import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersService } from './users.service';
import { UserRepository } from '../common/repositories/user.repository';
import { RedisService } from '../redis/redis.service';

describe('UsersService lifecycle refresh-token revocation events', () => {
  let service: UsersService;
  let userRepository: Record<string, jest.Mock>;
  let eventEmitter: { emitAsync: jest.Mock };
  let redisService: Record<string, jest.Mock>;

  beforeEach(() => {
    userRepository = {
      findById: jest.fn(),
      existsByEmail: jest.fn(),
      update: jest.fn(),
      transactionDelete: jest.fn(),
    };
    eventEmitter = {
      emitAsync: jest.fn().mockResolvedValue([]),
    };
    redisService = {
      deleteByPattern: jest.fn().mockResolvedValue(0),
    };
    service = new UsersService(
      userRepository as unknown as UserRepository,
      eventEmitter as unknown as EventEmitter2,
      redisService as unknown as RedisService,
    );
  });

  it('awaits password_changed event after password update', async () => {
    userRepository.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      isActive: true,
    });
    userRepository.update.mockResolvedValue({ id: 'user-1' });
    let eventResolved = false;
    eventEmitter.emitAsync.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => {
        eventResolved = true;
        resolve([]);
      }, 10)),
    );

    await service.update('user-1', { password: 'NewPassword123!' });

    expect(eventResolved).toBe(true);
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith('user.password_changed', { userId: 'user-1' });
  });

  it('awaits deactivated event after active user is deactivated', async () => {
    userRepository.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      isActive: true,
    });
    userRepository.update.mockResolvedValue({ id: 'user-1', isActive: false });

    await service.update('user-1', { isActive: false });

    expect(eventEmitter.emitAsync).toHaveBeenCalledWith('user.deactivated', { userId: 'user-1' });
  });

  it('awaits deleted event after repository delete succeeds', async () => {
    userRepository.findById.mockResolvedValue({ id: 'user-1' });
    userRepository.transactionDelete.mockResolvedValue(undefined);

    await service.delete('user-1', 'admin-1');

    expect(redisService.deleteByPattern).toHaveBeenCalledWith('refresh:user-1:*');
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith('user.deleted', { userId: 'user-1' });
  });

  it('surfaces lifecycle event failure after password update', async () => {
    userRepository.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      isActive: true,
    });
    userRepository.update.mockResolvedValue({ id: 'user-1' });
    eventEmitter.emitAsync.mockRejectedValue(new Error('Redis down'));

    await expect(service.update('user-1', { password: 'NewPassword123!' })).rejects.toThrow('Redis down');
  });

  it('keeps delete conflict behavior when repository delete fails', async () => {
    userRepository.findById.mockResolvedValue({ id: 'user-1' });
    userRepository.transactionDelete.mockRejectedValue(new Error('foreign key'));

    await expect(service.delete('user-1', 'admin-1')).rejects.toThrow(ConflictException);
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('logs but does not surface revocation error after successful delete', async () => {
    userRepository.findById.mockResolvedValue({ id: 'user-1' });
    userRepository.transactionDelete.mockResolvedValue(undefined);
    eventEmitter.emitAsync.mockRejectedValue(new Error('Redis down'));

    await expect(service.delete('user-1', 'admin-1')).resolves.toBeUndefined();
    expect(userRepository.transactionDelete).toHaveBeenCalledTimes(1);
    expect(redisService.deleteByPattern).toHaveBeenCalledWith('refresh:user-1:*');
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith('user.deleted', { userId: 'user-1' });
  });

  it('does not throw if Redis token revocation fails during delete', async () => {
    userRepository.findById.mockResolvedValue({ id: 'user-1' });
    userRepository.transactionDelete.mockResolvedValue(undefined);
    redisService.deleteByPattern.mockRejectedValue(new Error('Redis unreachable'));

    await expect(service.delete('user-1', 'admin-1')).resolves.toBeUndefined();
    expect(userRepository.transactionDelete).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith('user.deleted', { userId: 'user-1' });
  });
});
