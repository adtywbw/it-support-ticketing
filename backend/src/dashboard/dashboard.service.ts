import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStatus, SLAStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

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
    const counts = await this.prisma.ticket.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    const result: Record<string, number> = {};
    for (const status of Object.values(TicketStatus)) {
      result[status] = 0;
    }
    for (const item of counts) {
      result[item.status] = item._count.id;
    }
    return result;
  }

  private async getPriorityCounts() {
    const counts = await this.prisma.ticket.groupBy({
      by: ['priority'],
      _count: { id: true },
    });

    const result: Record<string, number> = {};
    for (const item of counts) {
      result[item.priority] = item._count.id;
    }
    return result;
  }

  private async getSLAStats() {
    const activeWhere = {
      status: { notIn: [TicketStatus.Closed, TicketStatus.Resolved] },
    };

    const [total, onTrack, atRisk, breached] = await Promise.all([
      this.prisma.ticket.count({ where: activeWhere }),
      this.prisma.ticket.count({
        where: { ...activeWhere, slaStatus: SLAStatus.OnTrack },
      }),
      this.prisma.ticket.count({
        where: { ...activeWhere, slaStatus: SLAStatus.AtRisk },
      }),
      this.prisma.ticket.count({
        where: { ...activeWhere, slaStatus: SLAStatus.Breached },
      }),
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

    const tickets = await this.prisma.ticket.findMany({
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
    const resolvedTickets = await this.prisma.ticket.findMany({
      where: {
        resolvedAt: { not: null },
        status: { in: [TicketStatus.Resolved, TicketStatus.Closed] },
      },
      select: {
        resolvedAt: true,
        createdAt: true,
        category: { select: { id: true, name: true } },
      },
    });

    const categoryTimes: Record<
      string,
      { totalMinutes: number; count: number; name: string }
    > = {};

    for (const ticket of resolvedTickets) {
      if (!ticket.resolvedAt) continue;
      const minutes =
        (ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) /
        (1000 * 60);
      const catId = ticket.category.id;
      if (!categoryTimes[catId]) {
        categoryTimes[catId] = { totalMinutes: 0, count: 0, name: ticket.category.name };
      }
      categoryTimes[catId].totalMinutes += minutes;
      categoryTimes[catId].count += 1;
    }

    return Object.entries(categoryTimes).map(([categoryId, data]) => ({
      categoryId,
      categoryName: data.name,
      avgResolutionMinutes: Math.round(data.totalMinutes / data.count),
      ticketCount: data.count,
    }));
  }
}
