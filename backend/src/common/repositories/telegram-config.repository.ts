import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

const DEFAULT_KEY = 'default';

@Injectable()
export class TelegramConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the singleton TelegramConfig row by its unique key.
   * Use this instead of findFirst to guarantee deterministic singleton access.
   */
  async findUniqueByKey(key: string = DEFAULT_KEY) {
    return this.prisma.telegramConfig.findUnique({
      where: { key },
    });
  }

  /**
   * Backward-compatible alias for findUniqueByKey.
   * Always resolves the singleton by key = "default".
   */
  async findFirst() {
    return this.findUniqueByKey();
  }

  /**
   * Atomically finds or creates the singleton TelegramConfig row.
   * Uses upsert on the unique key to prevent race conditions under
   * concurrent startup/config access.
   */
  async findOrCreate(defaults?: Partial<Prisma.TelegramConfigCreateInput>) {
    return this.prisma.telegramConfig.upsert({
      where: { key: DEFAULT_KEY },
      create: { key: DEFAULT_KEY, ...(defaults || {}) },
      update: {},
    });
  }

  async create(data: Prisma.TelegramConfigCreateInput) {
    return this.prisma.telegramConfig.create({
      data: { key: DEFAULT_KEY, ...data },
    });
  }

  async update(data: Prisma.TelegramConfigUpdateInput) {
    return this.prisma.telegramConfig.update({
      where: { key: DEFAULT_KEY },
      data,
    });
  }
}
