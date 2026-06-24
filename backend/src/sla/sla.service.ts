import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

      const onTrack: string[] = [];
      const atRisk: string[] = [];
      const breached: string[] = [];

      for (const ticket of batch) {
        const slaConfig = ticket.category.slaConfigs.find(
          (config) => config.priority === ticket.priority,
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
        await this.prisma.ticket.updateMany({
          where: { id: { in: onTrack } },
          data: { slaStatus: SLAStatus.OnTrack },
        });
      }
      if (atRisk.length > 0) {
        await this.prisma.ticket.updateMany({
          where: { id: { in: atRisk } },
          data: { slaStatus: SLAStatus.AtRisk },
        });
      }
      if (breached.length > 0) {
        await this.prisma.ticket.updateMany({
          where: { id: { in: breached } },
          data: { slaStatus: SLAStatus.Breached },
        });
      }

      processed += batch.length;
    }
  }
}
