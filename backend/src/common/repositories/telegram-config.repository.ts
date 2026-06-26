import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TelegramConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findFirst() {
    return this.prisma.telegramConfig.findFirst();
  }

  async findOrCreate(defaults?: Record<string, unknown>) {
    const existing = await this.findFirst();
    if (existing) return existing;
    return this.create(defaults || {});
  }

  async create(data: Record<string, unknown>) {
    return this.prisma.telegramConfig.create({ data } as any);
  }

  async update(id: string, data: Record<string, unknown>) {
    return this.prisma.telegramConfig.update({
      where: { id },
      data,
    });
  }
}
