import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FaqInteractionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.FaqInteractionUncheckedCreateInput) {
    return this.prisma.faqInteraction.create({ data });
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.prisma.faqInteraction.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }
}
