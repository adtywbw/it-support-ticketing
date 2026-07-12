import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class FaqRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveOrdered() {
    return this.prisma.faq.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, question: true, answer: true, displayOrder: true },
    });
  }

  async findAll() {
    return this.prisma.faq.findMany({
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      include: { subCategory: { select: { id: true, name: true } } },
    });
  }

  async findActiveForRecommendations() {
    return this.prisma.faq.findMany({
      where: { isActive: true },
      select: {
        id: true,
        question: true,
        answer: true,
        displayOrder: true,
        updatedAt: true,
        subCategoryId: true,
        showOnLogin: true,
        keywords: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.faq.findUnique({ where: { id } });
  }

  async create(data: Prisma.FaqCreateInput) {
    return this.prisma.faq.create({ data });
  }

  async update(id: string, data: Prisma.FaqUpdateInput) {
    return this.prisma.faq.update({ where: { id }, data });
  }

  async delete(id: string) {
    return this.prisma.faq.delete({ where: { id } });
  }
}
