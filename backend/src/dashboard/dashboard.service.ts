import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketRepository } from '../common/repositories/ticket.repository';
import { RedisService } from '../redis/redis.service';
import { TicketStatus, SLAStatus } from '@prisma/client';

const DASHBOARD_CACHE_KEY = 'dashboard:stats:v1';
const DASHBOARD_CACHE_TTL = 30;

@Injectable()
export class DashboardService {
  constructor(
    private readonly ticketRepository: TicketRepository,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async getStats(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = await this.redisService.get(DASHBOARD_CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    }

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

    const result = {
      statusCounts,
      priorityCounts,
      slaStats,
      dailyTrends: {
        last7Days: dailyTrends7d,
        last30Days: dailyTrends30d,
      },
      categoryResolution,
    };

    await this.redisService.set(DASHBOARD_CACHE_KEY, JSON.stringify(result), DASHBOARD_CACHE_TTL);

    return result;
  }

  async invalidateCache() {
    await this.redisService.del(DASHBOARD_CACHE_KEY);
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
    const rows = await this.prisma.$queryRaw<Array<{
      total: number;
      onTrack: number;
      atRisk: number;
      breached: number;
    }>>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "slaStatus" = 'OnTrack')::int AS "onTrack",
        COUNT(*) FILTER (WHERE "slaStatus" = 'AtRisk')::int AS "atRisk",
        COUNT(*) FILTER (WHERE "slaStatus" = 'Breached')::int AS breached
      FROM tickets
      WHERE status NOT IN ('Closed', 'Resolved')
    `;

    const stats = rows[0];
    return {
      total: stats.total,
      onTrack: stats.onTrack,
      atRisk: stats.atRisk,
      breached: stats.breached,
      complianceRate: stats.total > 0 ? Math.round((stats.onTrack / stats.total) * 100) : 100,
    };
  }

  private async getDailyTrends(days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const rows = await this.prisma.$queryRaw<Array<{ day: string; count: number }>>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM tickets
      WHERE "createdAt" >= ${since}
      GROUP BY date_trunc('day', "createdAt")
      ORDER BY day ASC
    `;

    const trends: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const date = new Date(since);
      date.setDate(date.getDate() + i);
      const key = date.toISOString().split('T')[0];
      trends[key] = 0;
    }
    for (const row of rows) {
      trends[row.day] = row.count;
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
