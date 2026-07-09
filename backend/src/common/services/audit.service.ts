import { Injectable, Logger, HttpException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { AuditLogRepository } from '../repositories/audit-log.repository';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  /**
   * Periodic cleanup of old audit log entries to prevent unbounded table growth.
   * Removes records older than 90 days. Runs daily at 3:00 AM.
   */
  @Cron('0 3 * * *')
  async cleanupOldLogs() {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    try {
      const { count } = await this.auditLogRepository.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (count > 0) {
        this.logger.log(`Cleaned up ${count} audit log entr${count === 1 ? 'y' : 'ies'} older than 90 days`);
      }
    } catch (error) {
      this.logger.warn(`Audit log cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

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
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      createdAt: new Date(),
    };

    // Always log to structured logger
    this.logger.log(JSON.stringify(entry));

    // Persist to database (fire-and-forget — never block the caller)
    try {
      await this.auditLogRepository.create(entry as Prisma.AuditLogCreateInput);
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
