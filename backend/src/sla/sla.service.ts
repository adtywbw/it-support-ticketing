import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { SlaConfigRepository } from '../common/repositories/sla-config.repository';
import { TicketRepository } from '../common/repositories/ticket.repository';
import { CategoryRepository } from '../common/repositories/category.repository';
import { RedisService } from '../redis/redis.service';
import { Priority, SLAStatus, TicketStatus } from '@prisma/client';
import { appConfig } from '../common/config/app.config';

@Injectable()
export class SLAService {
  private static readonly RELEASE_LOCK_SCRIPT = `
    if redis.call('get', KEYS[1]) == ARGV[1] then
      return redis.call('del', KEYS[1])
    else
      return 0
    end
  `;

  private readonly logger = new Logger(SLAService.name);

  constructor(
    private readonly slaConfigRepository: SlaConfigRepository,
    private readonly ticketRepository: TicketRepository,
    private readonly redisService: RedisService,
    private readonly categoryRepository: CategoryRepository,
  ) {}

  async getSLAConfig(categoryId: string, priority: Priority) {
    const config = await this.slaConfigRepository.findUnique({
      categoryId_priority: { categoryId, priority },
    });

    if (!config || !config.isActive) {
      return null;
    }

    return config;
  }

  async findAll() {
    const configs = await this.slaConfigRepository.findAll();
    const configsWithCount = await Promise.all(
      configs.map(async (config) => {
        const ticketCount = await this.ticketRepository.count({
          categoryId: config.categoryId,
          priority: config.priority,
        });
        return { ...config, _count: { tickets: ticketCount } };
      }),
    );
    return configsWithCount;
  }

  async findAllActive() {
    return this.slaConfigRepository.findAllActive();
  }

  async delete(id: string) {
    const config = await this.slaConfigRepository.findUnique({ id });
    if (!config) throw new NotFoundException('SLA config not found');

    const existingTickets = await this.ticketRepository.findMany({
      where: {
        categoryId: config.categoryId,
        priority: config.priority,
      },
      take: 1,
      select: { id: true },
    });

    if (existingTickets.length > 0) {
      throw new ConflictException(
        'Cannot delete SLA config: tickets still exist for this category and priority combination.',
      );
    }

    await this.slaConfigRepository.delete(id);
  }

  async create(data: {
    categoryId: string;
    priority: Priority;
    responseTimeMinutes: number;
    resolutionTimeMinutes: number;
  }) {
    this.assertSlaWindow(data.responseTimeMinutes, data.resolutionTimeMinutes);

    const category = await this.categoryRepository.findById(data.categoryId, {});
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    try {
      const config = await this.slaConfigRepository.create({
        category: { connect: { id: data.categoryId } },
        priority: data.priority,
        responseTimeMinutes: data.responseTimeMinutes,
        resolutionTimeMinutes: data.resolutionTimeMinutes,
      });

      await this.recalculateOpenTicketsForConfig({
        categoryId: config.categoryId,
        priority: config.priority,
        resolutionTimeMinutes: config.resolutionTimeMinutes,
      });

      return config;
    } catch (error) {
      this.handlePrismaWriteError(error);
    }
  }

  async update(
    id: string,
    data: {
      responseTimeMinutes?: number;
      resolutionTimeMinutes?: number;
      isActive?: boolean;
    },
  ) {
    const existing = await this.slaConfigRepository.findUnique({ id });
    if (!existing) {
      throw new NotFoundException('SLA config not found');
    }

    const shouldRecalculate = data.responseTimeMinutes !== undefined || data.resolutionTimeMinutes !== undefined;

    if (shouldRecalculate) {
      const responseTimeMinutes = data.responseTimeMinutes ?? existing.responseTimeMinutes;
      const resolutionTimeMinutes = data.resolutionTimeMinutes ?? existing.resolutionTimeMinutes;
      this.assertSlaWindow(responseTimeMinutes, resolutionTimeMinutes);
    }

    try {
      const updated = await this.slaConfigRepository.update(id, data);

      if (shouldRecalculate) {
        await this.recalculateOpenTicketsForConfig({
          categoryId: updated.categoryId,
          priority: updated.priority,
          resolutionTimeMinutes: updated.resolutionTimeMinutes,
        });
      }

      if (data.isActive === false) {
        await this.clearSlaForConfig(updated.categoryId, updated.priority);
      }

      return updated;
    } catch (error) {
      this.handlePrismaWriteError(error);
    }
  }

  private assertSlaWindow(responseTimeMinutes: number, resolutionTimeMinutes: number) {
    if (resolutionTimeMinutes < responseTimeMinutes) {
      throw new BadRequestException('Resolution time must be greater than or equal to response time');
    }
  }

  calculateSlaStatus(
    slaDueAt: Date | null,
    resolutionTimeMinutes: number,
    now: Date,
  ): SLAStatus | null {
    if (!slaDueAt) return null;

    const totalWindowMs = resolutionTimeMinutes * 60 * 1000;
    const remainingMs = slaDueAt.getTime() - now.getTime();

    if (remainingMs <= 0) {
      return SLAStatus.Breached;
    }

    if (remainingMs / totalWindowMs <= appConfig.sla.atRiskRatio) {
      return SLAStatus.AtRisk;
    }

    return SLAStatus.OnTrack;
  }

  private async recalculateOpenTicketsForConfig(config: {
    categoryId: string;
    priority: Priority;
    resolutionTimeMinutes: number;
  }) {
    // Acquire the same lock as the cron checkSLA() to prevent concurrent
    // writes to slaDueAt/slaStatus on the same ticket set.
    const lockKey = 'sla:check:lock';
    const lockToken = `recalc:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const acquired = await this.redisService.setNx(lockKey, lockToken, appConfig.sla.checkLockTtl).catch(() => false);
    if (!acquired) {
      this.logger.log('SLA check lock held by another operation, skipping recalculation');
      return;
    }
    try {
      await this.doRecalculate(config);
    } finally {
      await this.redisService.eval(
        SLAService.RELEASE_LOCK_SCRIPT,
        [lockKey],
        [lockToken],
      ).catch(() => {});
    }
  }

  private async doRecalculate(config: {
    categoryId: string;
    priority: Priority;
    resolutionTimeMinutes: number;
  }) {
    const batchSize = appConfig.sla.batchSize;
    let lastId: string | undefined;

    const now = new Date();

    while (true) {
      const tickets = await this.ticketRepository.findMany({
        where: {
          categoryId: config.categoryId,
          priority: config.priority,
          status: {
            notIn: [TicketStatus.Resolved, TicketStatus.Closed],
          },
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        select: { id: true },
        take: batchSize,
        orderBy: { id: 'asc' },
      });

      if (tickets.length === 0) break;

      lastId = tickets[tickets.length - 1].id;
      const ids = tickets.map((t) => t.id);

      // Single SQL UPDATE computes slaDueAt per-row from each ticket's own
      // createdAt, avoiding N individual round-trips while preserving
      // per-ticket accuracy.
      await this.ticketRepository.recalculateSlaBatch(
        ids,
        config.resolutionTimeMinutes,
        appConfig.sla.atRiskRatio,
        now,
      );
    }
  }

  /** Clear SLA due-at and status for non-terminal tickets using this config.
   *  Called when an SLA config is deactivated so stale SLA values don't
   *  linger on tickets that are no longer governed by an active rule. */
  private async clearSlaForConfig(categoryId: string, priority: Priority) {
    await this.ticketRepository.updateMany(
      {
        categoryId,
        priority,
        status: {
          notIn: [TicketStatus.Resolved, TicketStatus.Closed],
        },
      },
      {
        slaDueAt: null,
        slaStatus: null,
      },
    );
  }

  private handlePrismaWriteError(error: unknown): never {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: string }).code
      : undefined;

    if (code === 'P2002') {
      throw new ConflictException('SLA config already exists for this category and priority');
    }
    if (code === 'P2025') {
      throw new NotFoundException('SLA config not found');
    }
    throw error;
  }

  @Cron('*/5 * * * *')
  async checkSLA() {
    const lockKey = 'sla:check:lock';
    const lockToken = `lock:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const acquired = await this.redisService.setNx(lockKey, lockToken, appConfig.sla.checkLockTtl);

    if (!acquired) {
      this.logger.log('SLA check already running, skipping');
      return;
    }

    try {
      await this.performSLACheck();
    } catch (error) {
      this.logger.error('SLA check failed', error);
    } finally {
      await this.redisService.eval(
        SLAService.RELEASE_LOCK_SCRIPT,
        [lockKey],
        [lockToken],
      );
    }
  }

  private async performSLACheck() {
    const now = new Date();
    const batchSize = appConfig.sla.batchSize;
    let lastId: string | undefined;

    // Pre-load all active SLA configs grouped by categoryId to avoid
    // per-ticket joins in the batch loop
    const allActiveConfigs = await this.slaConfigRepository.findAllActive();
    const slaConfigMap = new Map<string, Array<{ priority: Priority; resolutionTimeMinutes: number }>>();
    for (const config of allActiveConfigs) {
      const entries = slaConfigMap.get(config.categoryId) ?? [];
      entries.push({ priority: config.priority, resolutionTimeMinutes: config.resolutionTimeMinutes });
      slaConfigMap.set(config.categoryId, entries);
    }

    while (true) {
      const batch = await this.ticketRepository.findMany({
        where: {
          status: {
            notIn: [TicketStatus.Resolved, TicketStatus.Closed],
          },
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        select: {
          id: true,
          ticketNumber: true,
          priority: true,
          categoryId: true,
          slaDueAt: true,
          slaStatus: true,
        },
        take: batchSize,
        orderBy: { id: 'asc' },
      });

      if (batch.length === 0) break;
      lastId = batch[batch.length - 1].id;

      const onTrack: string[] = [];
      const atRisk: string[] = [];
      const breached: string[] = [];

      for (const ticket of batch) {
        const configs = slaConfigMap.get(ticket.categoryId);
        const slaConfig = configs?.find((c) => c.priority === ticket.priority);

        if (!slaConfig || !ticket.slaDueAt) continue;

        const totalWindowMs = slaConfig.resolutionTimeMinutes * 60 * 1000;
        const remainingMs = ticket.slaDueAt.getTime() - now.getTime();
        const remainingRatio = remainingMs / totalWindowMs;

        let newSlaStatus: SLAStatus;

        if (remainingMs <= 0) {
          newSlaStatus = SLAStatus.Breached;
        } else if (remainingRatio <= appConfig.sla.atRiskRatio) {
          newSlaStatus = SLAStatus.AtRisk;
        } else {
          newSlaStatus = SLAStatus.OnTrack;
        }

        if (newSlaStatus !== ticket.slaStatus) {
          if (newSlaStatus === SLAStatus.OnTrack) onTrack.push(ticket.id);
          else if (newSlaStatus === SLAStatus.AtRisk) atRisk.push(ticket.id);
          else if (newSlaStatus === SLAStatus.Breached) breached.push(ticket.id);

          this.logger.log(
            `Ticket ${ticket.ticketNumber} SLA status changed from ${ticket.slaStatus} to ${newSlaStatus}`,
          );
        }
      }

      if (onTrack.length > 0) {
        await this.ticketRepository.updateMany(
          { id: { in: onTrack } },
          { slaStatus: SLAStatus.OnTrack },
        );
      }
      if (atRisk.length > 0) {
        await this.ticketRepository.updateMany(
          { id: { in: atRisk } },
          { slaStatus: SLAStatus.AtRisk },
        );
      }
      if (breached.length > 0) {
        await this.ticketRepository.updateMany(
          { id: { in: breached } },
          { slaStatus: SLAStatus.Breached },
        );
      }

    }
  }
}
