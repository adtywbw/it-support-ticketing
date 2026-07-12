import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface FaqAnalyticsSummaryRow {
  recommendationSessions: number;
  resolvedWithoutTicketSessions: number;
  continuedToTicketSessions: number;
}

export interface FaqMetricRow {
  faqId: string;
  question: string;
  sessions: number;
}

export interface FaqSubCategoryMetricRow {
  subCategoryId: string;
  subCategoryName: string;
  categoryName: string;
  recommendationSessions: number;
  resolvedWithoutTicketSessions: number;
}

@Injectable()
export class FaqInteractionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.FaqInteractionUncheckedCreateInput) {
    return this.prisma.faqInteraction.create({ data });
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.prisma.faqInteraction.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }

  async getSummary(since: Date): Promise<FaqAnalyticsSummaryRow> {
    const [row] = await this.prisma.$queryRaw<FaqAnalyticsSummaryRow[]>(Prisma.sql`
      WITH sessions AS (
        SELECT
          "sessionId",
          BOOL_OR("eventType" = 'RecommendationsShown') AS shown,
          BOOL_OR("eventType" = 'ProblemResolved') AS resolved,
          BOOL_OR("eventType" = 'TicketCreated') AS ticket_created
        FROM "faq_interactions"
        WHERE "createdAt" >= ${since}
        GROUP BY "sessionId"
      )
      SELECT
        COUNT(*) FILTER (WHERE shown)::int AS "recommendationSessions",
        COUNT(*) FILTER (WHERE shown AND resolved AND NOT ticket_created)::int AS "resolvedWithoutTicketSessions",
        COUNT(*) FILTER (WHERE shown AND ticket_created)::int AS "continuedToTicketSessions"
      FROM sessions
    `);
    return row ?? {
      recommendationSessions: 0,
      resolvedWithoutTicketSessions: 0,
      continuedToTicketSessions: 0,
    };
  }

  async getTopOpenedFaqs(since: Date, limit = 5): Promise<FaqMetricRow[]> {
    return this.prisma.$queryRaw<FaqMetricRow[]>(Prisma.sql`
      SELECT
        interaction."faqId" AS "faqId",
        faq."question" AS "question",
        COUNT(DISTINCT interaction."sessionId")::int AS "sessions"
      FROM "faq_interactions" interaction
      JOIN "faqs" faq ON faq."id" = interaction."faqId"
      WHERE interaction."createdAt" >= ${since}
        AND interaction."eventType" = 'ArticleOpened'
      GROUP BY interaction."faqId", faq."question"
      ORDER BY "sessions" DESC, faq."question" ASC
      LIMIT ${limit}
    `);
  }

  async getTopResolvedFaqs(since: Date, limit = 5): Promise<FaqMetricRow[]> {
    return this.prisma.$queryRaw<FaqMetricRow[]>(Prisma.sql`
      SELECT
        interaction."faqId" AS "faqId",
        faq."question" AS "question",
        COUNT(DISTINCT interaction."sessionId")::int AS "sessions"
      FROM "faq_interactions" interaction
      JOIN "faqs" faq ON faq."id" = interaction."faqId"
      WHERE interaction."createdAt" >= ${since}
        AND interaction."eventType" = 'ProblemResolved'
        AND NOT EXISTS (
          SELECT 1
          FROM "faq_interactions" ticket_event
          WHERE ticket_event."sessionId" = interaction."sessionId"
            AND ticket_event."eventType" = 'TicketCreated'
            AND ticket_event."createdAt" >= ${since}
        )
      GROUP BY interaction."faqId", faq."question"
      ORDER BY "sessions" DESC, faq."question" ASC
      LIMIT ${limit}
    `);
  }

  async getSubCategoryStats(since: Date, limit = 5): Promise<FaqSubCategoryMetricRow[]> {
    return this.prisma.$queryRaw<FaqSubCategoryMetricRow[]>(Prisma.sql`
      WITH sub_category_sessions AS (
        SELECT
          "sessionId",
          "subCategoryId",
          BOOL_OR("eventType" = 'RecommendationsShown') AS shown,
          BOOL_OR("eventType" = 'ProblemResolved') AS resolved,
          BOOL_OR("eventType" = 'TicketCreated') AS ticket_created
        FROM "faq_interactions"
        WHERE "createdAt" >= ${since}
        GROUP BY "sessionId", "subCategoryId"
      )
      SELECT
        sub_category."id" AS "subCategoryId",
        sub_category."name" AS "subCategoryName",
        category."name" AS "categoryName",
        COUNT(*) FILTER (WHERE sub_category_sessions.shown)::int AS "recommendationSessions",
        COUNT(*) FILTER (
          WHERE sub_category_sessions.shown
            AND sub_category_sessions.resolved
            AND NOT sub_category_sessions.ticket_created
        )::int AS "resolvedWithoutTicketSessions"
      FROM sub_category_sessions
      JOIN "sub_categories" sub_category ON sub_category."id" = sub_category_sessions."subCategoryId"
      JOIN "categories" category ON category."id" = sub_category."categoryId"
      GROUP BY sub_category."id", sub_category."name", category."name"
      ORDER BY "recommendationSessions" DESC, category."name" ASC, sub_category."name" ASC
      LIMIT ${limit}
    `);
  }
}
