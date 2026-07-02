import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, Priority, SLAStatus, TicketStatus } from '@prisma/client';

export type TicketAccessScope = {
  userId: string;
  role: 'EndUser' | 'ITSupport' | 'Admin';
};

/**
 * Builds the base `where` clause for a tickets query that respects the
 * caller's role. EndUser is automatically scoped to their own tickets;
 * ITSupport/Admin see all tickets. Caller-provided `where` fields are
 * merged on top (so explicit filters still apply).
 */
export function buildTicketAccessWhere(
  scope: TicketAccessScope,
  where: Record<string, unknown> = {},
): Record<string, unknown> {
  if (scope.role === 'EndUser') {
    return { ...where, requesterId: scope.userId };
  }
  return where;
}

export type DashboardTicketSummary = {
  id: string;
  ticketNumber: string;
  subject: string;
  priority: Priority;
  status: TicketStatus;
  slaStatus: SLAStatus | null;
  slaDueAt: Date | null;
  assignedTo: { id: string; name: string } | null;
  createdAt: Date;
};

export type DashboardAttentionTickets = {
  slaRisk: DashboardTicketSummary[];
  highPriority: DashboardTicketSummary[];
  unassigned: DashboardTicketSummary[];
};

const activeDashboardWhere: Prisma.TicketWhereInput = {
  status: { notIn: [TicketStatus.Resolved, TicketStatus.Closed] },
};

const dashboardTicketSummarySelect = {
  id: true,
  ticketNumber: true,
  subject: true,
  priority: true,
  status: true,
  slaStatus: true,
  slaDueAt: true,
  assignedTo: { select: { id: true, name: true } },
  createdAt: true,
} satisfies Prisma.TicketSelect;

@Injectable()
export class TicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.TicketCreateInput, include?: Prisma.TicketInclude) {
    return this.prisma.ticket.create({ data, include }) as any;
  }

  async findById(id: string, include?: Prisma.TicketInclude) {
    return this.prisma.ticket.findUnique({ where: { id }, include }) as any;
  }

  async findUnique(args: Prisma.TicketFindUniqueArgs) {
    return this.prisma.ticket.findUnique(args) as any;
  }

  async findMany(args: Prisma.TicketFindManyArgs) {
    return this.prisma.ticket.findMany(args) as any;
  }

  /**
   * Like findMany but automatically scopes EndUser to their own tickets.
   * Use this for any list/CSV/export endpoint that takes a user request,
   * so the EndUser filter cannot be forgotten by a new caller.
   */
  async findManyForUser(
    args: Prisma.TicketFindManyArgs,
    scope: TicketAccessScope,
  ) {
    return this.prisma.ticket.findMany({
      ...args,
      where: buildTicketAccessWhere(scope, args.where as Record<string, unknown>) as any,
    }) as any;
  }

  async countForUser(where: Prisma.TicketWhereInput, scope: TicketAccessScope) {
    return this.prisma.ticket.count({
      where: buildTicketAccessWhere(scope, where as Record<string, unknown>) as any,
    });
  }

  async findFirst(args: Prisma.TicketFindFirstArgs) {
    return this.prisma.ticket.findFirst(args) as any;
  }

  async count(where: Prisma.TicketWhereInput) {
    return this.prisma.ticket.count({ where });
  }

  async getDashboardCurrentSnapshot() {
    const [activeTickets, open, inProgress, slaRisk, unassigned] = await Promise.all([
      this.prisma.ticket.count({ where: activeDashboardWhere }),
      this.prisma.ticket.count({ where: { status: TicketStatus.Open } }),
      this.prisma.ticket.count({ where: { status: TicketStatus.InProgress } }),
      this.prisma.ticket.count({
        where: {
          ...activeDashboardWhere,
          slaStatus: { in: [SLAStatus.AtRisk, SLAStatus.Breached] },
        },
      }),
      this.prisma.ticket.count({
        where: {
          ...activeDashboardWhere,
          assignedToId: null,
        },
      }),
    ]);

    return { activeTickets, open, inProgress, slaRisk, unassigned };
  }

  async getDashboardAttentionTickets(): Promise<DashboardAttentionTickets> {
    const [slaRisk, highPriority, unassigned] = await Promise.all([
      this.prisma.ticket.findMany({
        where: {
          ...activeDashboardWhere,
          slaStatus: { in: [SLAStatus.Breached, SLAStatus.AtRisk] },
        },
        select: dashboardTicketSummarySelect,
        orderBy: [{ slaStatus: 'desc' }, { slaDueAt: 'asc' }, { createdAt: 'asc' }],
        take: 5,
      }),
      this.prisma.ticket.findMany({
        where: {
          ...activeDashboardWhere,
          priority: { in: [Priority.Critical, Priority.High] },
        },
        select: dashboardTicketSummarySelect,
        orderBy: [{ priority: 'desc' }, { slaDueAt: 'asc' }, { createdAt: 'asc' }],
        take: 5,
      }),
      this.prisma.ticket.findMany({
        where: {
          ...activeDashboardWhere,
          assignedToId: null,
        },
        select: dashboardTicketSummarySelect,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: 5,
      }),
    ]);

    return {
      slaRisk: slaRisk as DashboardTicketSummary[],
      highPriority: highPriority as DashboardTicketSummary[],
      unassigned: unassigned as DashboardTicketSummary[],
    };
  }

  async update(id: string, data: Prisma.TicketUpdateInput) {
    return this.prisma.ticket.update({ where: { id }, data }) as any;
  }

  async updateMany(where: Prisma.TicketWhereInput, data: Prisma.TicketUpdateManyMutationInput) {
    return this.prisma.ticket.updateMany({ where, data });
  }

  async delete(id: string) {
    return this.prisma.ticket.delete({ where: { id } }) as any;
  }

  async countPublicCommentsByTicketIds(ticketIds: string[]): Promise<Array<{ ticketId: string; count: number }>> {
    if (ticketIds.length === 0) return [];
    return this.prisma.$queryRaw<Array<{ ticketId: string; count: number }>>`
      SELECT "ticketId", COUNT(*)::int AS count
      FROM comments
      WHERE "ticketId" = ANY(${ticketIds})
        AND type = 'PUBLIC'
      GROUP BY "ticketId"
    `;
  }

  async countVisibleAttachmentsByTicketIds(ticketIds: string[]): Promise<Array<{ ticketId: string; count: number }>> {
    if (ticketIds.length === 0) return [];
    return this.prisma.$queryRaw<Array<{ ticketId: string; count: number }>>`
      SELECT a."ticketId", COUNT(*)::int AS count
      FROM attachments a
      LEFT JOIN comments c ON c.id = a."commentId"
      WHERE a."ticketId" = ANY(${ticketIds})
        AND a.visibility = 'PUBLIC'
        AND (a."commentId" IS NULL OR c.type = 'PUBLIC')
      GROUP BY a."ticketId"
    `;
  }

  async groupBy(args: any) {
    return this.prisma.ticket.groupBy(args) as any;
  }

  async getDashboardStatusCounts(from: Date, to: Date) {
    return this.prisma.ticket.groupBy({
      by: ['status'],
      where: { createdAt: { gte: from, lt: to } },
      _count: { id: true },
    }) as any;
  }

  async getDashboardPriorityCounts(from: Date, to: Date) {
    return this.prisma.ticket.groupBy({
      by: ['priority'],
      where: { createdAt: { gte: from, lt: to } },
      _count: { id: true },
    }) as any;
  }

  async getDashboardSLAStatsForRange(from: Date, to: Date) {
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
      WHERE "createdAt" >= ${from}
        AND "createdAt" < ${to}
    `;
    return rows[0];
  }

  async getAvgResolutionTimeByCategoryForRange(from: Date, to: Date) {
    return this.prisma.$queryRaw<Array<{
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
        AND t."resolvedAt" >= ${from}
        AND t."resolvedAt" < ${to}
      GROUP BY t."categoryId", c.name
      ORDER BY "avgResolutionMinutes" DESC
    `;
  }

  async getTopCategories(from: Date, to: Date) {
    return this.prisma.$queryRaw<Array<{
      categoryId: string;
      categoryName: string;
      count: bigint;
    }>>`
      SELECT
        t."categoryId" AS "categoryId",
        c.name AS "categoryName",
        COUNT(*)::int AS count
      FROM tickets t
      JOIN categories c ON c.id = t."categoryId"
      WHERE t."createdAt" >= ${from}
        AND t."createdAt" < ${to}
      GROUP BY t."categoryId", c.name
      ORDER BY count DESC, c.name ASC
      LIMIT 5
    `;
  }

  async getSLAStats() {
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
    return rows[0];
  }

  async getDailyTrends(from: Date, to: Date) {
    return this.prisma.$queryRaw<Array<{ day: string; count: number }>>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM tickets
      WHERE "createdAt" >= ${from}
        AND "createdAt" < ${to}
      GROUP BY date_trunc('day', "createdAt")
      ORDER BY day ASC
    `;
  }

  async getAvgResolutionTimeByCategory() {
    return this.prisma.$queryRaw<Array<{
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
  }

  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ) {
    return this.prisma.$transaction(fn, options);
  }

  async transactionBatch(operations: Prisma.PrismaPromise<unknown>[]) {
    return this.prisma.$transaction(operations);
  }
}
