import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Priority, TicketStatus } from '@prisma/client';
import {
  DashboardAttentionTickets,
  DashboardTicketSummary,
  TicketRepository,
} from '../common/repositories/ticket.repository';
import { RedisService } from '../redis/redis.service';
import {
  DASHBOARD_RANGE_PRESETS,
  DashboardRangePreset,
  QueryDashboardStatsDto,
} from './dto/query-dashboard-stats.dto';
import { appConfig } from '../common/config/app.config';

const DASHBOARD_CACHE_KEY_PREFIX = 'dashboard:stats:v2';

type ResolvedDashboardRange = {
  preset: DashboardRangePreset;
  from: Date;
  toExclusive: Date;
  displayTo: Date;
  cacheKeySuffix: string;
};

type DashboardCountRow = {
  _count: { id: number };
  [key: string]: unknown;
};

type SerializedDashboardTicketSummary = Omit<DashboardTicketSummary, 'createdAt' | 'slaDueAt'> & {
  createdAt: string;
  slaDueAt: string | null;
};

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly ticketRepository: TicketRepository,
    private readonly redisService: RedisService,
  ) {}

  async getStats(query: QueryDashboardStatsDto = {}) {
    const range = this.resolveRange(query);
    const cacheKey = `${DASHBOARD_CACHE_KEY_PREFIX}:${range.cacheKeySuffix}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn('Failed to read dashboard cache', error);
    }

    const [
      current,
      attention,
      statusCounts,
      priorityCounts,
      slaStats,
      dailyTrendRows,
      categoryResolution,
      topCategories,
    ] = await Promise.all([
      this.ticketRepository.getDashboardCurrentSnapshot(),
      this.ticketRepository.getDashboardAttentionTickets(),
      this.ticketRepository.getDashboardStatusCounts(range.from, range.toExclusive),
      this.ticketRepository.getDashboardPriorityCounts(range.from, range.toExclusive),
      this.ticketRepository.getDashboardSLAStatsForRange(range.from, range.toExclusive),
      this.ticketRepository.getDailyTrends(range.from, range.toExclusive),
      this.ticketRepository.getAvgResolutionTimeByCategoryForRange(range.from, range.toExclusive),
      this.ticketRepository.getTopCategories(range.from, range.toExclusive),
    ]);

    const result = {
      current,
      attention: this.serializeAttention(attention),
      analytics: {
        range: {
          preset: range.preset,
          from: this.formatDateKey(range.from),
          to: this.formatDateKey(range.displayTo),
        },
        trend: this.fillDailyTrend(range.from, range.toExclusive, dailyTrendRows),
        statusCounts: this.buildEnumCounts(Object.values(TicketStatus), statusCounts, 'status'),
        priorityCounts: this.buildEnumCounts(Object.values(Priority), priorityCounts, 'priority'),
        slaComplianceRate: this.calculateComplianceRate(slaStats),
        avgResolutionTimeByCategory: categoryResolution.map((row) => ({
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          avgResolutionMinutes: row.avgResolutionMinutes,
          ticketCount: Number(row.ticketCount),
        })),
        topCategories: topCategories.map((row) => ({
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          count: Number(row.count),
        })),
      },
    };

    try {
      await this.redisService.set(cacheKey, JSON.stringify(result), appConfig.dashboard.cacheTtl);
    } catch (error) {
      this.logger.warn('Failed to write dashboard cache', error);
    }

    return result;
  }

  async invalidateCache() {
    await this.redisService.deleteByPattern(`${DASHBOARD_CACHE_KEY_PREFIX}:*`);
  }

  @OnEvent('ticket.created')
  @OnEvent('ticket.status.updated')
  @OnEvent('ticket.assigned')
  @OnEvent('ticket.priority.updated')
  @OnEvent('ticket.deleted')
  async handleTicketChanged() {
    try {
      await this.invalidateCache();
    } catch (error) {
      this.logger.warn('Failed to invalidate dashboard cache', error);
    }
  }

  private resolveRange(query: QueryDashboardStatsDto): ResolvedDashboardRange {
    const preset = query.range ?? '30d';
    if (!DASHBOARD_RANGE_PRESETS.includes(preset)) {
      throw new BadRequestException('range must be one of 7d, 30d, 90d, custom');
    }

    if (preset === 'custom') {
      if (!query.from || !query.to) {
        throw new BadRequestException('Custom dashboard range requires from and to dates');
      }
      const from = this.parseDateStart(query.from, 'from');
      const displayTo = this.parseDateStart(query.to, 'to');
      if (from.getTime() > displayTo.getTime()) {
        throw new BadRequestException('from must be before or equal to to');
      }
      return {
        preset,
        from,
        toExclusive: this.addDays(displayTo, 1),
        displayTo,
        cacheKeySuffix: `custom:${this.formatDateKey(from)}:${this.formatDateKey(displayTo)}`,
      };
    }

    const daysByPreset: Record<Exclude<DashboardRangePreset, 'custom'>, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
    };
    const displayTo = this.startOfDay(new Date());
    const from = this.addDays(displayTo, -(daysByPreset[preset] - 1));

    return {
      preset,
      from,
      toExclusive: this.addDays(displayTo, 1),
      displayTo,
      cacheKeySuffix: preset,
    };
  }

  private serializeAttention(attention: DashboardAttentionTickets) {
    return {
      // Safety cap: repository already limits to 5 via `take: 5`, but
      // keeping the slice ensures defense-in-depth if the contract changes.
      slaRisk: attention.slaRisk.slice(0, 5).map((ticket) => this.serializeTicket(ticket)),
      highPriority: attention.highPriority.slice(0, 5).map((ticket) => this.serializeTicket(ticket)),
      unassigned: attention.unassigned.slice(0, 5).map((ticket) => this.serializeTicket(ticket)),
    };
  }

  private serializeTicket(ticket: DashboardTicketSummary): SerializedDashboardTicketSummary {
    return {
      ...ticket,
      slaDueAt: ticket.slaDueAt ? ticket.slaDueAt.toISOString() : null,
      createdAt: ticket.createdAt.toISOString(),
    };
  }

  private buildEnumCounts<T extends string>(
    values: T[],
    rows: DashboardCountRow[],
    key: string,
  ): Record<T, number> {
    const result = values.reduce((acc, value) => ({ ...acc, [value]: 0 }), {} as Record<T, number>);
    for (const row of rows) {
      const rowKey = row[key];
      if (typeof rowKey === 'string' && values.includes(rowKey as T)) {
        result[rowKey as T] = row._count.id;
      } else {
        this.logger.warn(`Unexpected ${key} value "${String(rowKey)}" in dashboard aggregation — treating as 0`);
      }
    }
    return result;
  }

  private calculateComplianceRate(stats: { total: number; onTrack: number }) {
    return stats.total > 0 ? Math.round((stats.onTrack / stats.total) * 100) : 100;
  }

  private fillDailyTrend(from: Date, toExclusive: Date, rows: Array<{ day: string; count: number }>) {
    const countByDay = new Map(rows.map((row) => [row.day, row.count]));
    const trend: Array<{ date: string; count: number }> = [];
    for (let cursor = new Date(from); cursor.getTime() < toExclusive.getTime(); cursor = this.addDays(cursor, 1)) {
      const key = this.formatDateKey(cursor);
      trend.push({ date: key, count: countByDay.get(key) ?? 0 });
    }
    return trend;
  }

  private parseDateStart(value: string, label: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${label} must be a valid date`);
    }
    return this.startOfDay(date);
  }

  private startOfDay(date: Date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
