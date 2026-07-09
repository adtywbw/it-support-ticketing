import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.AuditLogCreateInput) {
    return this.prisma.auditLog.create({ data });
  }

  async findMany(params: {
    where?: Prisma.AuditLogWhereInput;
    orderBy?: Prisma.AuditLogOrderByWithRelationInput;
    skip?: number;
    take?: number;
  }) {
    return this.prisma.auditLog.findMany(params);
  }

  async count(params: { where?: Prisma.AuditLogWhereInput }) {
    return this.prisma.auditLog.count(params);
  }

  async deleteMany(params: { where: Prisma.AuditLogWhereInput }) {
    return this.prisma.auditLog.deleteMany(params);
  }
}
