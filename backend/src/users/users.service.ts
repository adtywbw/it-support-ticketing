import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { UserRepository } from '../common/repositories/user.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/** Return type when an inactive user is reactivated via create(). */
type ReactivatedUser = Prisma.UserGetPayload<Record<string, never>> & { reactivated: boolean };

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findByEmail(email: string) {
    return this.userRepository.findByEmail(email);
  }

  async findById(id: string) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByIdWithPassword(id: string) {
    const user = await this.userRepository.findByIdWithPassword(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    role?: string;
    search?: string;
    includeInactive?: boolean;
  }) {
    return this.userRepository.findAll(params);
  }

  async findAssignable() {
    return this.userRepository.findAssignable();
  }

  async create(createUserDto: CreateUserDto) {
    const normalizedEmail = createUserDto.email.toLowerCase().trim();
    const existing = await this.userRepository.existsByEmail(normalizedEmail);

    if (existing) {
      if (!existing.isActive) {
        const hashedPassword = await bcrypt.hash(createUserDto.password, 12);
        const reactivated = await this.userRepository.update(existing.id, {
          password: hashedPassword,
          name: createUserDto.name,
          role: createUserDto.role || 'EndUser',
          isActive: true,
        });
        return {
          ...reactivated,
          reactivated: true,
        } as ReactivatedUser;
      }
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);
    return this.userRepository.create({
      email: normalizedEmail,
      password: hashedPassword,
      name: createUserDto.name,
      role: createUserDto.role || 'EndUser',
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const normalizedEmail = updateUserDto.email?.toLowerCase().trim();
    if (normalizedEmail !== undefined && normalizedEmail.toLowerCase() !== user.email.toLowerCase()) {
      const existing = await this.userRepository.existsByEmail(normalizedEmail);
      if (existing) {
        throw new ConflictException('Email already in use');
      }
    }

    const data: Prisma.UserUpdateInput = { ...updateUserDto };
    if (normalizedEmail && normalizedEmail !== user.email) {
      data.email = normalizedEmail;
    }
    if (updateUserDto.password) {
      data.password = await bcrypt.hash(updateUserDto.password, 12);
    }

    const result = await this.userRepository.update(id, data);

    if (updateUserDto.password) {
      await this.eventEmitter.emitAsync('user.password_changed', { userId: id });
    }

    if (user.isActive && updateUserDto.isActive === false) {
      await this.eventEmitter.emitAsync('user.deactivated', { userId: id });
    }

    return result;
  }

  async delete(id: string, requesterId?: string): Promise<void> {
    if (id === requesterId) {
      throw new BadRequestException('Cannot delete your own account');
    }

    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    try {
      await this.userRepository.transactionDelete(id);
    } catch {
      throw new ConflictException(
        'Cannot delete user with existing tickets, comments, or attachments. Deactivate the user instead.',
      );
    }
    try {
      await this.eventEmitter.emitAsync('user.deleted', { userId: id });
    } catch (error) {
      this.logger.error(
        `Failed to emit user.deleted event for user ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
