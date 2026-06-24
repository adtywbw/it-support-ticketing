import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketRepository } from '../common/repositories/ticket.repository';
import { TicketStatus, SLAStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(
    private readonly ticketRepository: TicketRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getStats() {
    const [
      statusCounts,
      priorityCounts,
      slaStats,
      dailyTrends7d,
      dailyTrends30d,
      categoryResolution,
    ] = await Promise.all([
      this.getStatusCounts(),
      this.getPriorityCounts(),
      this.getSLAStats(),
      this.getDailyTrends(7),
      this.getDailyTrends(30),
      this.getAvgResolutionTimeByCategory(),
    ]);

    return {
      statusCounts,
      priorityCounts,
      slaStats,
      dailyTrends: {
        last7Days: dailyTrends7d,
        last30Days: dailyTrends30d,
      },
      categoryResolution,
    };
  }

  private async getStatusCounts() {
    const counts = await this.ticketRepository.groupBy({
      by: ['status'],
      _count: { id: true },
    } as any);

    const result: Record<string, number> = {};
    for (const status of Object.values(TicketStatus)) {
      result[status] = 0;
    }
    for (const item of counts as any[]) {
      result[item.status] = item._count.id;
    }
    return result;
  }

  private async getPriorityCounts() {
    const counts = await this.ticketRepository.groupBy({
      by: ['priority'],
      _count: { id: true },
    } as any);

    const result: Record<string, number> = {};
    for (const item of counts as any[]) {
      result[item.priority] = item._count.id;
    }
    return result;
  }

  private async getSLAStats() {
    const activeWhere = {
      status: { notIn: [TicketStatus.Closed, TicketStatus.Resolved] },
    };

    const [total, onTrack, atRisk, breached] = await Promise.all([
      this.ticketRepository.count(activeWhere),
      this.ticketRepository.count({ ...activeWhere, slaStatus: SLAStatus.OnTrack }),
      this.ticketRepository.count({ ...activeWhere, slaStatus: SLAStatus.AtRisk }),
      this.ticketRepository.count({ ...activeWhere, slaStatus: SLAStatus.Breached }),
    ]);

    return {
      total,
      onTrack,
      atRisk,
      breached,
      complianceRate: total > 0 ? Math.round((onTrack / total) * 100) : 100,
    };
  }

  private async getDailyTrends(days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const tickets = await this.ticketRepository.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const trends: Record<string, number> = {};

    for (let i = 0; i < days; i++) {
      const date = new Date(since);
      date.setDate(date.getDate() + i);
      const key = date.toISOString().split('T')[0];
      trends[key] = 0;
    }

    for (const ticket of tickets) {
      const key = ticket.createdAt.toISOString().split('T')[0];
      if (trends[key] !== undefined) {
        trends[key]++;
      }
    }

    return trends;
  }

  private async getAvgResolutionTimeByCategory() {
    const rows = await this.prisma.$queryRaw<Array<{
      categoryId: string;
      categoryName: string;
      avgResolutionMinutes: number;
      ticketCount: bigint;
    }>>`
      SELECT
        t."categoryId" AS "categoryId",
        c.name AS "categoryName",
        ROUND(AVG(EXTRACT(EPOCH FROM (t."resolvedAt" - t."createdAt")) / 60))::int AS "avgResolutionMinutes",
        COUNT(*)::int AS "ticketCount"
      FROM tickets t
      JOIN categories c ON c.id = t."categoryId"
      WHERE t."resolvedAt" IS NOT NULL
        AND t.status IN ('Resolved', 'Closed')
      GROUP BY t."categoryId", c.name
    `;

    return rows.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      avgResolutionMinutes: r.avgResolutionMinutes,
      ticketCount: Number(r.ticketCount),
    }));
  }
}
