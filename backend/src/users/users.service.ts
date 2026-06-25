import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { UserRepository } from '../common/repositories/user.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
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
    const existing = await this.userRepository.existsByEmail(createUserDto.email);

    if (existing) {
      if (!existing.isActive) {
        const hashedPassword = await bcrypt.hash(createUserDto.password, 12);
        return this.userRepository.update(existing.id, {
          password: hashedPassword,
          name: createUserDto.name,
          role: createUserDto.role || 'EndUser',
          isActive: true,
        });
      }
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);
    return this.userRepository.create({
      email: createUserDto.email,
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

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existing = await this.userRepository.existsByEmail(updateUserDto.email);
      if (existing) {
        throw new ConflictException('Email already in use');
      }
    }

    const data: Record<string, unknown> = { ...updateUserDto };
    if (updateUserDto.password) {
      data.password = await bcrypt.hash(updateUserDto.password, 12);
    }

    const result = await this.userRepository.update(id, data);

    if (updateUserDto.password) {
      this.eventEmitter.emit('user.password_changed', { userId: id });
    }

    return result;
  }

  async delete(id: string): Promise<void> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    try {
      await this.userRepository.transactionDelete(id);
      this.eventEmitter.emit('user.deleted', { userId: id });
    } catch {
      throw new ConflictException(
        'Cannot delete user with existing tickets, comments, or attachments. Deactivate the user instead.',
      );
    }
  }
}
