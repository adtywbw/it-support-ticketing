import { Injectable, Logger, HttpException } from '@nestjs/common';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  log(
    action: string,
    entity: string,
    entityId: string,
    userId: string,
    metadata?: Record<string, unknown>,
  ): void {
    const entry = {
      action,
      entity,
      entityId,
      userId,
      metadata: metadata ?? {},
      timestamp: new Date().toISOString(),
    };

    this.logger.log(JSON.stringify(entry));
  }

  logAndThrow(
    action: string,
    entity: string,
    entityId: string,
    userId: string,
    exception: HttpException,
    metadata?: Record<string, unknown>,
  ): void {
    this.log(action, entity, entityId, userId, {
      ...metadata,
      exceptionMessage: exception.message,
      exceptionStatus: exception.getStatus(),
    });

    throw exception;
  }
}
