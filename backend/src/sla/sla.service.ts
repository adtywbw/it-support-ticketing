import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Priority, SLAStatus, TicketStatus } from '@prisma/client';

@Injectable()
export class SLAService {
  private readonly logger = new Logger(SLAService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async getSLAConfig(categoryId: string, priority: Priority) {
    const config = await this.prisma.sLAConfig.findUnique({
      where: {
        categoryId_priority: { categoryId, priority },
      },
    });

    if (!config || !config.isActive) {
      const fallback = await this.prisma.sLAConfig.findFirst({
        where: { isActive: true },
        orderBy: { resolutionTimeMinutes: 'asc' },
      });
      return fallback || null;
    }

    return config;
  }

  async findAll() {
    return this.prisma.sLAConfig.findMany({
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ categoryId: 'asc' }, { priority: 'asc' }],
    });
  }

  async create(data: {
    categoryId: string;
    priority: Priority;
    responseTimeMinutes: number;
    resolutionTimeMinutes: number;
  }) {
    return this.prisma.sLAConfig.create({ data });
  }

  async update(
    id: string,
    data: {
      responseTimeMinutes?: number;
      resolutionTimeMinutes?: number;
      isActive?: boolean;
    },
  ) {
    return this.prisma.sLAConfig.update({ where: { id }, data });
  }

  @Cron('*/5 * * * *')
  async checkSLA() {
    const lockKey = 'sla:check:lock';
    const lockExists = await this.redisService.exists(lockKey);

    if (lockExists) {
      this.logger.log('SLA check already running, skipping');
      return;
    }

    await this.redisService.set(lockKey, '1', 300);

    try {
      await this.performSLACheck();
    } catch (error) {
      this.logger.error('SLA check failed', error);
    } finally {
      await this.redisService.del(lockKey);
    }
  }

  private async performSLACheck() {
    const now = new Date();
    const batchSize = 500;
    let processed = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await this.prisma.ticket.findMany({
        where: {
          status: {
            notIn: [TicketStatus.Resolved, TicketStatus.Closed],
          },
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
        skip: processed,
        orderBy: { id: 'asc' },
      });

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      for (const ticket of batch) {
        const slaConfig = ticket.category.slaConfigs.find(
          (config) => config.priority === ticket.priority,
        );

        if (!slaConfig) continue;

        const totalWindowMs = slaConfig.resolutionTimeMinutes * 60 * 1000;
        const remainingMs = ticket.slaDueAt.getTime() - now.getTime();
        const remainingRatio = remainingMs / totalWindowMs;

        let newSlaStatus: SLAStatus = ticket.slaStatus;

        if (remainingMs <= 0) {
          newSlaStatus = SLAStatus.Breached;
        } else if (remainingRatio <= 0.2) {
          newSlaStatus = SLAStatus.AtRisk;
        } else {
          newSlaStatus = SLAStatus.OnTrack;
        }

        if (newSlaStatus !== ticket.slaStatus) {
          await this.prisma.ticket.update({
            where: { id: ticket.id },
            data: { slaStatus: newSlaStatus },
          });

          this.logger.log(
            `Ticket ${ticket.ticketNumber} SLA status changed from ${ticket.slaStatus} to ${newSlaStatus}`,
          );
        }
      }

      processed += batch.length;
    }
  }
}
