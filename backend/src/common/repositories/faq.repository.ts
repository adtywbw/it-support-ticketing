import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class FaqRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveOrdered() {
    return this.prisma.faq.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async findAll() {
    return this.prisma.faq.findMany({
      orderBy: { displayOrder: 'asc' },
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
