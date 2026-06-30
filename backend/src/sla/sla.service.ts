import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SlaConfigRepository } from '../common/repositories/sla-config.repository';
import { TicketRepository } from '../common/repositories/ticket.repository';
import { CategoryRepository } from '../common/repositories/category.repository';
import { RedisService } from '../redis/redis.service';
import { Priority, SLAStatus, TicketStatus } from '@prisma/client';

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
      const fallback = await this.slaConfigRepository.findFirst({
        where: { isActive: true },
        orderBy: { resolutionTimeMinutes: 'asc' },
      });
      return fallback || null;
    }

    return config;
  }

  async findAll() {
    return this.slaConfigRepository.findAll();
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
      return await this.slaConfigRepository.create({
        category: { connect: { id: data.categoryId } },
        priority: data.priority,
        responseTimeMinutes: data.responseTimeMinutes,
        resolutionTimeMinutes: data.resolutionTimeMinutes,
      });
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

    if (data.responseTimeMinutes !== undefined || data.resolutionTimeMinutes !== undefined) {
      const responseTimeMinutes = data.responseTimeMinutes ?? existing.responseTimeMinutes;
      const resolutionTimeMinutes = data.resolutionTimeMinutes ?? existing.resolutionTimeMinutes;
      this.assertSlaWindow(responseTimeMinutes, resolutionTimeMinutes);
    }

    try {
      return await this.slaConfigRepository.update(id, data);
    } catch (error) {
      this.handlePrismaWriteError(error);
    }
  }

  private assertSlaWindow(responseTimeMinutes: number, resolutionTimeMinutes: number) {
    if (resolutionTimeMinutes < responseTimeMinutes) {
      throw new BadRequestException('Resolution time must be greater than or equal to response time');
    }
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
    const acquired = await this.redisService.setNx(lockKey, lockToken, 300);

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
    const batchSize = 500;
    let lastId: string | undefined;

    while (true) {
      const batch = await this.ticketRepository.findMany({
        where: {
          status: {
            notIn: [TicketStatus.Resolved, TicketStatus.Closed],
          },
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        include: {
          category: {
            include: {
              slaConfigs: {
                where: { isActive: true },
              },
            },
          },
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
        const slaConfig = ticket.category.slaConfigs.find(
          (config: any) => config.priority === ticket.priority,
        );

        if (!slaConfig) continue;

        const totalWindowMs = slaConfig.resolutionTimeMinutes * 60 * 1000;
        const remainingMs = ticket.slaDueAt.getTime() - now.getTime();
        const remainingRatio = remainingMs / totalWindowMs;

        let newSlaStatus: SLAStatus;

        if (remainingMs <= 0) {
          newSlaStatus = SLAStatus.Breached;
        } else if (remainingRatio <= 0.2) {
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
