import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

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

  async getDailyTrends(days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    return this.prisma.$queryRaw<Array<{ day: string; count: number }>>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM tickets
      WHERE "createdAt" >= ${since}
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
