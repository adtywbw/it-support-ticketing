import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class LocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeInactive?: boolean) {
    return this.prisma.location.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { tickets: true } },
      },
    });
  }

  async findAllForForm() {
    return this.prisma.location.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.location.findUnique({
      where: { id },
      include: {
        _count: { select: { tickets: true } },
      },
    });
  }

  async findByName(name: string) {
    return this.prisma.location.findUnique({ where: { name } });
  }

  async create(data: Prisma.LocationCreateInput) {
    return this.prisma.location.create({ data });
  }

  async update(id: string, data: Prisma.LocationUpdateInput) {
    return this.prisma.location.update({ where: { id }, data });
  }

  async delete(id: string) {
    return this.prisma.location.delete({ where: { id } });
  }
}
