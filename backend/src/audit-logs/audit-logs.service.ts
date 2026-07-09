import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogRepository } from '../common/repositories/audit-log.repository';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

@Injectable()
export class AuditLogsService {
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  async findAll(query: QueryAuditLogDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.entity) where.entity = query.entity;
    if (query.userId) where.userId = query.userId;

    const [data, total] = await Promise.all([
      this.auditLogRepository.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.auditLogRepository.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
