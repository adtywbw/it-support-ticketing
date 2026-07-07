import { Injectable, Logger, HttpException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(
    action: string,
    entity: string,
    entityId: string,
    userId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const entry = {
      action,
      entity,
      entityId,
      userId: userId ?? null,
      metadata: (metadata ?? {}) as any,
      createdAt: new Date(),
    };

    // Always log to structured logger
    this.logger.log(JSON.stringify(entry));

    // Persist to database (fire-and-forget — never block the caller)
    try {
      await this.prisma.auditLog.create({ data: entry as any });
    } catch (error) {
      this.logger.warn(`Failed to persist audit log: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async logAndThrow(
    action: string,
    entity: string,
    entityId: string,
    userId: string,
    exception: HttpException,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.log(action, entity, entityId, userId, {
      ...metadata,
      exceptionMessage: exception.message,
      exceptionStatus: exception.getStatus(),
    });

    throw exception;
  }
}
