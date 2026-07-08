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
  where: Prisma.TicketWhereInput = {},
): Prisma.TicketWhereInput {
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

  async create(args: Prisma.TicketCreateArgs) {
    return this.prisma.ticket.create(args);
  }

  async findById(id: string, include?: Prisma.TicketFindUniqueArgs['include']) {
    const args: Prisma.TicketFindUniqueArgs = { where: { id } };
    if (include) args.include = include;
    return this.prisma.ticket.findUnique(args);
  }

  async findUnique<T extends Prisma.TicketFindUniqueArgs>(args: T) {
    return this.prisma.ticket.findUnique(args);
  }

  async findMany<T extends Prisma.TicketFindManyArgs>(args: T) {
    return this.prisma.ticket.findMany(args);
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
      where: buildTicketAccessWhere(scope, args.where ?? {}),
    });
  }

  async countForUser(where: Prisma.TicketWhereInput, scope: TicketAccessScope) {
    return this.prisma.ticket.count({
      where: buildTicketAccessWhere(scope, where),
    });
  }

  async findManySortedBySlaStatus(args: {
    scope: TicketAccessScope;
    filters: {
      status?: TicketStatus[];
      priority?: Priority[];
      categoryId?: string[];
      locationId?: string[];
      assignedToId?: string;
      requesterId?: string[];
      slaStatus?: SLAStatus[];
      dateFrom?: string;
      dateTo?: string;
      search?: string;
    };
    skip: number;
    take: number | undefined;
    sortOrder: 'asc' | 'desc';
    include: Prisma.TicketInclude;
  }) {
    const conditions: Prisma.Sql[] = [];

    if (args.scope.role === 'EndUser') {
      conditions.push(Prisma.sql`t."requesterId" = ${args.scope.userId}`);
    }

    const f = args.filters;
    if (f.status?.length) conditions.push(Prisma.sql`t."status"::text = ANY (ARRAY[${Prisma.join(f.status)}]::text[])`);
    if (f.priority?.length) conditions.push(Prisma.sql`t."priority"::text = ANY (ARRAY[${Prisma.join(f.priority)}]::text[])`);
    if (f.categoryId?.length) conditions.push(Prisma.sql`t."categoryId" = ANY (ARRAY[${Prisma.join(f.categoryId)}]::uuid[])`);
    if (f.locationId?.length) conditions.push(Prisma.sql`t."locationId" = ANY (ARRAY[${Prisma.join(f.locationId)}]::uuid[])`);
    if (f.assignedToId) conditions.push(Prisma.sql`t."assignedToId" = ${f.assignedToId}`);
    if (f.requesterId?.length) conditions.push(Prisma.sql`t."requesterId" = ANY (ARRAY[${Prisma.join(f.requesterId)}]::uuid[])`);
    if (f.slaStatus?.length) conditions.push(Prisma.sql`t."slaStatus"::text = ANY (ARRAY[${Prisma.join(f.slaStatus)}]::text[])`);

    if (f.dateFrom) {
      const startDate = new Date(f.dateFrom);
      startDate.setUTCHours(0, 0, 0, 0);
      conditions.push(Prisma.sql`t."createdAt" >= ${startDate}`);
    }
    if (f.dateTo) {
      const endDate = new Date(f.dateTo);
      endDate.setUTCHours(23, 59, 59, 999);
      conditions.push(Prisma.sql`t."createdAt" <= ${endDate}`);
    }

    if (f.search) {
      const pattern = `%${f.search}%`;
      conditions.push(
        Prisma.sql`(t."subject" ILIKE ${pattern} OR t."description" ILIKE ${pattern} OR t."ticketNumber" ILIKE ${pattern} OR t."itemCode" ILIKE ${pattern} OR COALESCE(loc."name",'') ILIKE ${pattern} OR COALESCE(req."name",'') ILIKE ${pattern})`,
      );
    }

    const hasSearch = !!f.search;
    const joinClause = hasSearch
      ? Prisma.sql`LEFT JOIN locations loc ON loc.id = t."locationId"\nLEFT JOIN users req ON req.id = t."requesterId"\n`
      : Prisma.empty;

    const whereClause =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    const validatedOrder = args.sortOrder === 'asc' ? 'asc' : 'desc';
    const orderDir = Prisma.raw(validatedOrder.toUpperCase());

    const limitClause =
      args.take !== undefined
        ? Prisma.sql`LIMIT ${args.take} OFFSET ${args.skip}`
        : Prisma.empty;

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT t.id FROM tickets t
      ${joinClause}
      ${whereClause}
      ORDER BY CASE "slaStatus"
                WHEN 'Breached' THEN 0
                WHEN 'AtRisk'   THEN 1
                WHEN 'OnTrack'  THEN 2
                ELSE 3
               END ${orderDir},
               "slaDueAt" ${orderDir}
      ${limitClause}
    `;

    const sortedIds = rows.map((r) => r.id);
    if (sortedIds.length === 0) return [];

    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: sortedIds } },
      include: args.include,
    });

    const ticketMap = new Map(tickets.map((t) => [t.id, t]));
    return sortedIds
      .map((id) => ticketMap.get(id))
      .filter((t): t is NonNullable<typeof t> => t != null);
  }

  async findFirst<T extends Prisma.TicketFindFirstArgs>(args: T) {
    return this.prisma.ticket.findFirst(args);
  }

  async count(where: Prisma.TicketWhereInput) {
    return this.prisma.ticket.count({ where });
  }

  async getDashboardCurrentSnapshot() {
    const rows = await this.prisma.$queryRaw<Array<{
      activeTickets: number;
      open: number;
      inProgress: number;
      slaRisk: number;
      unassigned: number;
    }>>`
      SELECT
        COUNT(*) FILTER (WHERE "status" NOT IN ('Resolved', 'Closed'))::int AS "activeTickets",
        COUNT(*) FILTER (WHERE "status" = 'Open')::int AS "open",
        COUNT(*) FILTER (WHERE "status" = 'InProgress')::int AS "inProgress",
        COUNT(*) FILTER (WHERE "status" NOT IN ('Resolved', 'Closed')
          AND "slaStatus" IN ('AtRisk', 'Breached'))::int AS "slaRisk",
        COUNT(*) FILTER (WHERE "status" NOT IN ('Resolved', 'Closed')
          AND "assignedToId" IS NULL)::int AS "unassigned"
      FROM tickets
    `;
    return rows[0];
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
      slaRisk,
      highPriority,
      unassigned,
    };
  }

  async update(id: string, data: Prisma.TicketUpdateInput) {
    return this.prisma.ticket.update({ where: { id }, data });
  }

  /**
   * Batch-recalculates slaDueAt and slaStatus for a set of ticket IDs in a
   * single SQL UPDATE. Each ticket's slaDueAt is computed from its own
   * createdAt + resolutionTimeMinutes, so per-ticket accuracy is preserved
   * without N individual round-trips.
   */
  async recalculateSlaBatch(
    ids: string[],
    resolutionTimeMinutes: number,
    atRiskRatio: number,
    now: Date,
  ) {
    if (ids.length === 0) return;
    const atRiskThresholdMinutes = Math.round(resolutionTimeMinutes * atRiskRatio);
    await this.prisma.$executeRaw`
      UPDATE tickets
      SET
        "slaDueAt" = "createdAt" + (${resolutionTimeMinutes} * interval '1 minute'),
        "slaStatus" = CASE
          WHEN "createdAt" + (${resolutionTimeMinutes} * interval '1 minute') <= ${now} THEN 'Breached'::"SLAStatus"
          WHEN "createdAt" + (${resolutionTimeMinutes} * interval '1 minute') <= ${now} + (${atRiskThresholdMinutes} * interval '1 minute') THEN 'AtRisk'::"SLAStatus"
          ELSE 'OnTrack'::"SLAStatus"
        END
      WHERE id IN (${Prisma.join(ids)})
        AND status NOT IN ('Resolved'::"TicketStatus", 'Closed'::"TicketStatus")
    `;
  }

  async updateMany(where: Prisma.TicketWhereInput, data: Prisma.TicketUpdateManyMutationInput) {
    return this.prisma.ticket.updateMany({ where, data });
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

  async getDashboardStatusCounts(from: Date, to: Date) {
    return this.prisma.ticket.groupBy({
      by: ['status'],
      where: { createdAt: { gte: from, lt: to } },
      _count: { id: true },
    });
  }

  async getDashboardPriorityCounts(from: Date, to: Date) {
    return this.prisma.ticket.groupBy({
      by: ['priority'],
      where: { createdAt: { gte: from, lt: to } },
      _count: { id: true },
    });
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

  async getDailyTrends(from: Date, to: Date, groupBy: 'day' | 'week' = 'day') {
    const trunc = groupBy === 'week' ? 'week' : 'day';
    return this.prisma.$queryRaw<Array<{ day: string; count: number }>>`
      SELECT to_char(date_trunc(${trunc}, "createdAt"), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM tickets
      WHERE "createdAt" >= ${from}
        AND "createdAt" < ${to}
      GROUP BY date_trunc(${trunc}, "createdAt")
      ORDER BY day ASC
    `;
  }

  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ) {
    return this.prisma.$transaction(fn, options);
  }

}
