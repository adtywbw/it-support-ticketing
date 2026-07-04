import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_KEY = 'default';

@Injectable()
export class LandingPageConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the singleton LandingPageConfig row by its unique key.
   * Use this instead of findFirst to guarantee deterministic singleton access.
   */
  async findUniqueByKey(key: string = DEFAULT_KEY) {
    return this.prisma.landingPageConfig.findUnique({
      where: { key },
    });
  }

  /**
   * Atomically finds or creates the singleton LandingPageConfig row.
   * Uses upsert on the unique key to prevent race conditions under
   * concurrent startup/config access.
   */
  async findOrCreate(defaults?: Record<string, unknown>) {
    return this.prisma.landingPageConfig.upsert({
      where: { key: DEFAULT_KEY },
      create: { key: DEFAULT_KEY, ...(defaults || {}) },
      update: {},
    }) as any;
  }

  async update(data: Record<string, unknown>) {
    return this.prisma.landingPageConfig.update({
      where: { key: DEFAULT_KEY },
      data,
    });
  }
}