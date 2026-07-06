import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersService } from '../users.service';
import { UserRepository } from '../../common/repositories/user.repository';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: any;
  let eventEmitter: any;

  beforeEach(async () => {
    userRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByIdWithPassword: jest.fn(),
      findAll: jest.fn(),
      findAssignable: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      existsByEmail: jest.fn(),
      transactionDelete: jest.fn(),
    };

    eventEmitter = {
      emitAsync: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserRepository, useValue: userRepository },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('create', () => {
    const createDto = {
      email: '  User@Example.COM  ',
      password: 'Password123!',
      name: 'John Doe',
      role: 'EndUser' as const,
    };

    it('should normalize email to lowercase when creating a new user', async () => {
      userRepository.existsByEmail.mockResolvedValue(null);
      userRepository.create.mockResolvedValue({
        id: 'new-user',
        email: 'user@example.com',
        name: 'John Doe',
        role: 'EndUser',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.create(createDto);

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
        }),
      );
    });

    it('should NOT include email in reactivation update (email already set from existsByEmail lookup)', async () => {
      userRepository.existsByEmail.mockResolvedValue({ id: 'existing-id', isActive: false });
      userRepository.update.mockResolvedValue({
        id: 'existing-id',
        email: 'user@example.com',
        name: 'John Doe',
        role: 'EndUser',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.create(createDto);

      expect(userRepository.update).toHaveBeenCalledWith(
        'existing-id',
        expect.not.objectContaining({ email: expect.anything() }),
      );
    });
  });

  describe('update', () => {
    it('should normalize email to lowercase when updating', async () => {
      const existingUser = {
        id: 'user-1',
        email: 'old@example.com',
        name: 'John Doe',
        role: 'EndUser',
        isActive: true,
      };
      userRepository.findById.mockResolvedValue(existingUser);
      userRepository.existsByEmail.mockResolvedValue(null);
      userRepository.update.mockResolvedValue({ ...existingUser, email: 'new@example.com' });

      await service.update('user-1', { email: '  NEW@Example.COM  ' });

      expect(userRepository.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          email: 'new@example.com',
        }),
      );
    });

    it('should not normalize email when it is not provided in update', async () => {
      const existingUser = {
        id: 'user-1',
        email: 'user@example.com',
        name: 'John Doe',
        role: 'EndUser',
        isActive: true,
      };
      userRepository.findById.mockResolvedValue(existingUser);
      userRepository.update.mockResolvedValue(existingUser);

      await service.update('user-1', { name: 'Jane Doe' });

      expect(userRepository.update).toHaveBeenCalledWith(
        'user-1',
        expect.not.objectContaining({ email: expect.anything() }),
      );
    });
  });
});
