import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  TicketRepository,
  TicketAccessScope,
} from "../common/repositories/ticket.repository";
import { CategoryRepository } from "../common/repositories/category.repository";
import { SubCategoryRepository } from "../common/repositories/sub-category.repository";
import { UserRepository } from "../common/repositories/user.repository";
import { SLAService } from "../sla/sla.service";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import {
  QueryTicketDto,
  TICKET_SORT_FIELDS,
} from "./dto/query-ticket.dto";
import { UpdateStatusDto } from "./dto/update-status.dto";
import { AssignTicketDto } from "./dto/assign-ticket.dto";
import { UpdatePriorityDto } from "./dto/update-priority.dto";
import {
  TicketStatus,
  Priority,
  SLAStatus,
  CommentType,
  AttachmentVisibility,
  Prisma,
  FaqInteractionType,
} from "@prisma/client";
import { STORAGE_SERVICE } from "../attachments/interfaces/storage-service.interface";
import type { StorageService } from "../attachments/interfaces/storage-service.interface";
import { AttachmentVisibilityPolicy } from "../common/policies/attachment-visibility.policy";
import { buildPaginationMeta } from "../common/utils/pagination.util";
import { appConfig } from "../common/config/app.config";
import { FaqInteractionRepository } from "../common/repositories/faq-interaction.repository";

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.Open]: [TicketStatus.InProgress],
  [TicketStatus.InProgress]: [TicketStatus.OnHold, TicketStatus.Resolved],
  [TicketStatus.OnHold]: [TicketStatus.InProgress],
  [TicketStatus.Resolved]: [TicketStatus.Closed],
  [TicketStatus.Closed]: [TicketStatus.Open],
};

/** Allowlist of sort-by fields usable in ticket list and CSV export queries. */
// Sort fields are defined and validated in QueryTicketDto; import them here
// to keep the DTO ↔ service contract in sync.

/** Map a sortBy field name to a Prisma TicketOrderByWithRelationInput.
 *  Relation fields (category, location, assignedTo, requester) need
 *  nested-object syntax; direct fields use the shorthand. */
function buildOrderBy(
  field: string,
  dir: "asc" | "desc",
): Prisma.TicketOrderByWithRelationInput {
  const relMap: Record<string, () => Prisma.TicketOrderByWithRelationInput> = {
    category: () => ({ category: { name: dir } }),
    location: () => ({ location: { name: dir } }),
    assignedTo: () => ({ assignedTo: { name: dir } }),
    requester: () => ({ requester: { name: dir } }),
  };
  if (field in relMap) return relMap[field]();
  return { [field]: dir };
}

/**
 * Shape of a ticket row in the CSV export stream. */
interface CsvExportTicket {
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  categoryId: string;
  category?: { name: string } | null;
  subCategory?: { name: string } | null;
  location?: { name: string } | null;
  itemCode: string;
  requester?: { name: string } | null;
  assignedTo?: { name: string } | null;
  createdAt: Date;
  resolvedAt?: Date | null;
  slaDueAt?: Date | null;
  slaStatus?: string | null;
}

interface TicketQueryInput {
  where: Prisma.TicketWhereInput;
  orderField: string;
  orderDir: "asc" | "desc";
}

/** Shared filter building for findAll and exportCsvToResponse. */
function buildTicketQueryInput(
  dto: Pick<
    QueryTicketDto,
    | "status"
    | "priority"
    | "categoryId"
    | "locationId"
    | "assignedToId"
    | "requesterId"
    | "slaStatus"
    | "dateFrom"
    | "dateTo"
    | "search"
    | "sortBy"
    | "sortOrder"
  >,
  userRole: string,
): TicketQueryInput {
  const where: Prisma.TicketWhereInput = {};

  if (dto.status?.length) where.status = { in: dto.status };
  if (dto.priority?.length) where.priority = { in: dto.priority };
  if (dto.categoryId?.length) where.categoryId = { in: dto.categoryId };
  if (dto.locationId?.length) where.locationId = { in: dto.locationId };
  if (dto.assignedToId) where.assignedToId = dto.assignedToId;
  if (dto.requesterId && userRole !== "EndUser")
    where.requesterId = { in: dto.requesterId };
  if (dto.slaStatus?.length) where.slaStatus = { in: dto.slaStatus };

  if (dto.dateFrom || dto.dateTo) {
    const createdAtFilter: Prisma.DateTimeFilter = {};
    if (dto.dateFrom) {
      const startDate = new Date(dto.dateFrom);
      startDate.setUTCHours(0, 0, 0, 0);
      createdAtFilter.gte = startDate;
    }
    if (dto.dateTo) {
      const endDate = new Date(dto.dateTo);
      endDate.setUTCHours(23, 59, 59, 999);
      createdAtFilter.lte = endDate;
    }
    where.createdAt = createdAtFilter;
  }

  if (dto.search) {
    where.OR = [
      { subject: { contains: dto.search, mode: "insensitive" } },
      { description: { contains: dto.search, mode: "insensitive" } },
      { ticketNumber: { contains: dto.search, mode: "insensitive" } },
      { itemCode: { contains: dto.search, mode: "insensitive" } },
      { location: { name: { contains: dto.search, mode: "insensitive" } } },
      { requester: { name: { contains: dto.search, mode: "insensitive" } } },
    ];
  }

  const sortBy = dto.sortBy || "createdAt";
  const orderField = (TICKET_SORT_FIELDS as readonly string[]).includes(sortBy)
    ? sortBy
    : "createdAt";
  const orderDir = dto.sortOrder === "asc" ? "asc" : "desc";

  return { where, orderField, orderDir };
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly ticketRepository: TicketRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly subCategoryRepository: SubCategoryRepository,
    private readonly userRepository: UserRepository,
    private readonly slaService: SLAService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageService,
    private readonly faqInteractionRepository: FaqInteractionRepository,
  ) {}

  async create(createTicketDto: CreateTicketDto, requesterId: string) {
    const category = await this.categoryRepository.findById(
      createTicketDto.categoryId,
      {},
    );

    if (!category || !category.isActive) {
      throw new BadRequestException("Category not found");
    }

    if (createTicketDto.subCategoryId) {
      const subCategory = await this.subCategoryRepository.findById(
        createTicketDto.subCategoryId,
      );
      if (
        !subCategory ||
        !subCategory.isActive ||
        subCategory.categoryId !== createTicketDto.categoryId
      ) {
        throw new BadRequestException(
          "Invalid sub-category for the selected category",
        );
      }
    }

    // Use SLAService.getSLAConfig so the priority-fallback rule
    // (lowest-resolutionTime active config) is applied consistently.
    // Previously this method fetched only the priority-specific config
    // and used a hardcoded 24h default if absent.
    const slaConfig = await this.slaService.getSLAConfig(
      createTicketDto.categoryId,
      createTicketDto.priority || Priority.Medium,
    );

    const ticket = await this.createTicketWithNumber(
      createTicketDto,
      requesterId,
      slaConfig,
    );

    this.eventEmitter.emit("ticket.created", {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      priority: ticket.priority,
      requesterId,
      requesterEmail: ticket.requester.email,
    });

    if (createTicketDto.selfServiceSessionId) {
      try {
        await this.faqInteractionRepository.create({
          sessionId: createTicketDto.selfServiceSessionId,
          userId: requesterId,
          categoryId: createTicketDto.categoryId,
          eventType: FaqInteractionType.TicketCreated,
        });
      } catch (error) {
        this.logger.error(
          "Failed to record FAQ TicketCreated interaction",
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return ticket;
  }

  async findAll(
    queryTicketDto: QueryTicketDto,
    userRole: string,
    userId: string,
  ) {
    const {
      page = 1,
      limit = 10,
      status,
      priority,
      categoryId,
      locationId,
      assignedToId,
      requesterId,
      slaStatus,
      dateFrom,
      dateTo,
      search,
    } = queryTicketDto;

    const { where, orderField, orderDir } = buildTicketQueryInput(
      queryTicketDto,
      userRole,
    );

    const scope: TicketAccessScope = {
      userId,
      role: userRole as "EndUser" | "ITSupport" | "Admin",
    };

    // For EndUser, count only PUBLIC comments and visible attachments to
    // avoid two extra post-query enrichment queries. For other roles, count all.
    const include =
      userRole === "EndUser"
        ? {
            requester: { select: { id: true, name: true, email: true } },
            assignedTo: {
              select: { id: true, name: true, email: true, isActive: true },
            },
            category: { select: { id: true, name: true } },
            subCategory: { select: { id: true, name: true } },
            location: { select: { id: true, name: true } },
            _count: {
              select: {
                comments: { where: { type: CommentType.PUBLIC } },
                attachments: {
                  where: {
                    visibility: AttachmentVisibility.PUBLIC,
                    OR: [
                      { commentId: null },
                      { comment: { type: CommentType.PUBLIC } },
                    ],
                  },
                },
              },
            },
          }
        : {
            requester: { select: { id: true, name: true, email: true } },
            assignedTo: {
              select: { id: true, name: true, email: true, isActive: true },
            },
            category: { select: { id: true, name: true } },
            subCategory: { select: { id: true, name: true } },
            location: { select: { id: true, name: true } },
            _count: { select: { comments: true, attachments: true } },
          };

    const [tickets, total] = await Promise.all([
      orderField === "slaStatus"
        ? this.ticketRepository.findManySortedBySlaStatus({
            scope,
            filters: {
              status,
              priority,
              categoryId,
              locationId,
              assignedToId,
              requesterId: userRole !== "EndUser" ? requesterId : undefined,
              slaStatus,
              dateFrom,
              dateTo,
              search,
            },
            skip: limit > 0 ? (page - 1) * limit : 0,
            take: limit > 0 ? limit : undefined,
            sortOrder: orderDir,
            include,
          })
        : this.ticketRepository.findManyForUser(
            {
              where,
              skip: limit > 0 ? (page - 1) * limit : 0,
              take: limit > 0 ? limit : undefined,
              orderBy: buildOrderBy(orderField, orderDir),
              include,
            },
            scope,
          ),
      this.ticketRepository.countForUser(where, scope),
    ]);

    // Null out SLA fields for tickets whose SLA config is inactive
    const cleaned = await this.stripStaleSlaValues(tickets);

    return { data: cleaned, meta: buildPaginationMeta(total, limit, page) };
  }

  /**
   * For tickets that still have slaDueAt/slaStatus set but whose matching SLA
   * config has been deactivated, null out those fields so the frontend does
   * not display stale SLA info.
   *
   * Active SLA configs are memoized with a short TTL to avoid a DB call on
   * every ticket list/detail fetch.
   */
  private activeConfigsCache: { data: { categoryId: string; priority: string }[]; expiresAt: number } | null = null;

  private async getActiveConfigKeys(): Promise<Set<string>> {
    const now = Date.now();
    if (this.activeConfigsCache && this.activeConfigsCache.expiresAt > now) {
      return new Set(this.activeConfigsCache.data.map((c) => `${c.categoryId}:${c.priority}`));
    }
    const activeConfigs = await this.slaService.findAllActive();
    this.activeConfigsCache = {
      data: activeConfigs,
      expiresAt: now + 30_000, // 30-second TTL
    };
    return new Set(activeConfigs.map((c) => `${c.categoryId}:${c.priority}`));
  }

  private async stripStaleSlaValues<T extends { slaDueAt?: Date | null; slaStatus?: string | null; categoryId: string; priority: string }>(tickets: T[]): Promise<T[]> {
    const activeKeys = await this.getActiveConfigKeys();
    return tickets.map((t) => {
      if (t.slaDueAt && !activeKeys.has(`${t.categoryId}:${t.priority}`)) {
        return { ...t, slaDueAt: null, slaStatus: null };
      }
      return t;
    });
  }

  async exportCsvToResponse(
    res: Response,
    queryTicketDto: QueryTicketDto,
    userRole: string,
    userId: string,
  ) {
    const MAX_EXPORT_ROWS = appConfig.tickets.maxExportRows;
    const BATCH_SIZE = appConfig.tickets.exportBatchSize;
    const {
      status,
      priority,
      categoryId,
      locationId,
      assignedToId,
      requesterId,
      slaStatus,
      dateFrom,
      dateTo,
      search,
    } = queryTicketDto;

    const { where, orderField, orderDir } = buildTicketQueryInput(
      queryTicketDto,
      userRole,
    );

    const escapeCsv = (value: unknown) => {
      const raw = String(value ?? "");
      const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const headers = [
      "Ticket #",
      "Subject",
      "Status",
      "Priority",
      "Category",
      "Sub Category",
      "Location",
      "Item Code",
      "Created By",
      "Assigned To",
      "Created At",
      "Resolved At",
      "SLA Status",
    ];
    res.write(headers.map(escapeCsv).join(",") + "\n");

    let totalExported = 0;
    let offset = 0;
    let aborted = false;
    const scope: TicketAccessScope = {
      userId,
      role: userRole as TicketAccessScope["role"],
    };

    // Handle client disconnect — abort the streaming loop to avoid
    // unhandled stream errors from res.write() on a closed connection.
    res.on("error", () => {
      aborted = true;
    });
    res.on("close", () => {
      aborted = true;
    });

    try {
      while (totalExported < MAX_EXPORT_ROWS && !aborted) {
        const exportInclude = {
          requester: { select: { id: true, name: true, email: true } },
          assignedTo: {
            select: { id: true, name: true, email: true, isActive: true },
          },
          category: { select: { id: true, name: true } },
          subCategory: { select: { id: true, name: true } },
          location: { select: { name: true } },
        };

        const batch =
          orderField === "slaStatus"
            ? await this.ticketRepository.findManySortedBySlaStatus({
                scope,
                filters: {
                  status,
                  priority,
                  categoryId,
                  locationId,
                  assignedToId,
                  requesterId: userRole !== "EndUser" ? requesterId : undefined,
                  slaStatus,
                  dateFrom,
                  dateTo,
                  search,
                },
                skip: offset,
                take: Math.min(BATCH_SIZE, MAX_EXPORT_ROWS - totalExported),
                sortOrder: orderDir,
                include: exportInclude,
              })
            : await this.ticketRepository.findManyForUser(
                {
                  where,
                  orderBy: [
                    buildOrderBy(orderField, orderDir),
                    { id: orderDir },
                  ] as Prisma.TicketOrderByWithRelationInput[],
                  skip: offset,
                  take: Math.min(BATCH_SIZE, MAX_EXPORT_ROWS - totalExported),
                  include: exportInclude,
                },
                scope,
              );

        if (batch.length === 0) break;

        // Strip stale SLA values from CSV batch (consistent with list/detail endpoints)
        const cleanedBatch = await this.stripStaleSlaValues(batch as CsvExportTicket[]);

        for (const ticket of cleanedBatch) {
          if (aborted) break;
          const row = [
            ticket.ticketNumber,
            ticket.subject,
            ticket.status,
            ticket.priority,
            ticket.category?.name || "",
            ticket.subCategory?.name || "",
            ticket.location?.name || "",
            ticket.itemCode || "",
            ticket.requester?.name || "",
            ticket.assignedTo?.name || "",
            ticket.createdAt.toISOString(),
            ticket.resolvedAt?.toISOString() || "",
            ticket.slaStatus || "",
          ];
          res.write(row.map(escapeCsv).join(",") + "\n");
          totalExported++;
        }

        offset += batch.length;
        if (batch.length < BATCH_SIZE) break;
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  async findById(id: string, userRole?: string, userId?: string) {
    const include: Prisma.TicketFindUniqueArgs["include"] = {
      requester: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          isActive: true,
        },
      },
      category: { select: { id: true, name: true } },
      subCategory: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      _count:
        userRole === "EndUser"
          ? {
              select: {
                comments: { where: { type: CommentType.PUBLIC } },
                attachments: {
                  where:
                    AttachmentVisibilityPolicy.buildVisibleAttachmentCountWhere(),
                },
              },
            }
          : { select: { comments: true, attachments: true } },
    };

    if (userRole !== "EndUser") {
      include.histories = {
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true } },
        },
      };
    }

    const ticket = await this.ticketRepository.findById(id, include);

    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }

    if (userRole === "EndUser" && ticket.requesterId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    const [cleaned] = await this.stripStaleSlaValues([ticket]);
    return cleaned;
  }

  async updateStatus(
    id: string,
    updateStatusDto: UpdateStatusDto,
    userId: string,
    userRole: string,
  ) {
    const result = await this.ticketRepository.transaction(
      async (
        tx,
      ): Promise<{
        ticket: {
          id: string;
          ticketNumber: string;
          subject: string;
          status: TicketStatus;
          requesterId: string;
          assignedToId: string | null;
        };
        oldStatus: TicketStatus;
        updatedTicket: unknown;
      }> => {
        const ticket = await tx.ticket.findUnique({ where: { id } });
        if (!ticket) {
          throw new NotFoundException("Ticket not found");
        }

        if (userRole === "EndUser") {
          if (ticket.requesterId !== userId) {
            throw new ForbiddenException("Access denied");
          }
          if (updateStatusDto.status !== TicketStatus.Closed) {
            throw new ForbiddenException(
              "End users can only close their own tickets",
            );
          }
          if (ticket.status !== TicketStatus.Resolved) {
            throw new ForbiddenException(
              "End users can only close resolved tickets",
            );
          }
        }

        const oldStatus = ticket.status as TicketStatus;
        const validNextStates = VALID_TRANSITIONS[oldStatus];
        if (!validNextStates.includes(updateStatusDto.status)) {
          throw new BadRequestException(
            `Cannot transition from ${ticket.status} to ${updateStatusDto.status}`,
          );
        }

        const updateData: Prisma.TicketUpdateManyMutationInput = {
          status: updateStatusDto.status,
        };

        if (updateStatusDto.status === TicketStatus.Resolved) {
          updateData.resolvedAt = new Date();
        }

        if (updateStatusDto.status === TicketStatus.Closed) {
          updateData.closedAt = new Date();
        }

        if (
          oldStatus === TicketStatus.Closed &&
          updateStatusDto.status !== TicketStatus.Closed
        ) {
          updateData.closedAt = null;
          updateData.resolvedAt = null;
        }

        const updated = await tx.ticket.updateMany({
          where: { id, status: oldStatus },
          data: updateData,
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            "Ticket status changed. Please refresh and retry.",
          );
        }

        await tx.ticketHistory.create({
          data: {
            ticketId: id,
            userId,
            field: "status",
            oldValue: oldStatus,
            newValue: updateStatusDto.status,
          },
        });

        return {
          ticket: {
            id: ticket.id,
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            status: ticket.status as TicketStatus,
            requesterId: ticket.requesterId,
            assignedToId: ticket.assignedToId,
          },
          oldStatus,
          updatedTicket: await tx.ticket.findUnique({ where: { id } }),
        };
      },
    );

    const { ticket, oldStatus } = result;

    this.eventEmitter.emit("ticket.status.updated", {
      ticketId: id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      oldStatus,
      newStatus: updateStatusDto.status,
      assignedToId: ticket.assignedToId,
      requesterId: ticket.requesterId,
      updatedBy: userId,
    });

    // Recalculate SLA when reopening a closed/resolved ticket to an active status
    if (
      (oldStatus === TicketStatus.Closed || oldStatus === TicketStatus.Resolved) &&
      updateStatusDto.status !== TicketStatus.Closed &&
      updateStatusDto.status !== TicketStatus.Resolved
    ) {
      const fullTicket = result.updatedTicket as { categoryId: string; priority: Priority } | null;
      if (fullTicket) {
        try {
          const slaConfig = await this.slaService.getSLAConfig(
            fullTicket.categoryId,
            fullTicket.priority,
          );
          if (slaConfig) {
            const slaDueAt = new Date(Date.now() + slaConfig.resolutionTimeMinutes * 60 * 1000);
            await this.ticketRepository.update(id, {
              slaDueAt,
              slaStatus: SLAStatus.OnTrack,
            });
          }
        } catch (err) {
          // Logger not injected in this service — log to stderr for ops visibility
          console.error(`Failed to recalculate SLA on ticket reopen: ${id}`, err);
        }
      }
    }

    return result.updatedTicket;
  }

  async assignTicket(
    id: string,
    assignTicketDto: AssignTicketDto,
    userId: string,
  ) {
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }

    const oldAssigneeId = ticket.assignedToId;

    // Validate assignee and update atomically inside a transaction to prevent
    // race conditions: two concurrent assigns would both pass the user check and
    // silently overwrite each other. Using updateMany with assignedToId in the
    // WHERE clause provides optimistic locking.
    const updatedTicket = await this.ticketRepository.transaction(
      async (tx) => {
        if (assignTicketDto.assignedToId) {
          const assignedUser = await tx.user.findUnique({
            where: { id: assignTicketDto.assignedToId },
            select: { id: true, role: true, isActive: true },
          });
          if (
            !assignedUser ||
            assignedUser.role === "EndUser" ||
            !assignedUser.isActive
          ) {
            throw new BadRequestException("Cannot assign ticket to this user");
          }
        }

        const updated = await tx.ticket.updateMany({
          where: { id, assignedToId: oldAssigneeId ?? null },
          data: {
            assignedToId: assignTicketDto.assignedToId ?? null,
          },
        });

        if (updated.count !== 1) {
          throw new ConflictException(
            "Ticket assignment changed. Please refresh and retry.",
          );
        }

        await tx.ticketHistory.create({
          data: {
            ticketId: id,
            userId,
            field: "assignedTo",
            oldValue: oldAssigneeId || null,
            newValue: assignTicketDto.assignedToId || null,
          },
        });

        // Re-fetch to get the full ticket with relations for the return value
        return tx.ticket.findUnique({
          where: { id },
          include: {
            assignedTo: { select: { id: true, name: true, email: true, isActive: true } },
          },
        });
      },
    );

    if (assignTicketDto.assignedToId) {
      this.eventEmitter.emit("ticket.assigned", {
        ticketId: id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        assignedToId: assignTicketDto.assignedToId,
        assignedBy: userId,
      });
    }

    return updatedTicket;
  }

  async updatePriority(
    id: string,
    updatePriorityDto: UpdatePriorityDto,
    userId: string,
  ) {
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }

    const oldPriority = ticket.priority;
    const newPriority = updatePriorityDto.priority;

    const slaConfig = await this.slaService.getSLAConfig(
      ticket.categoryId,
      newPriority,
    );

    const createdAt = new Date(ticket.createdAt).getTime();
    const slaDueAt = slaConfig
      ? new Date(createdAt + slaConfig.resolutionTimeMinutes * 60 * 1000)
      : null;
    const slaStatus = slaConfig
      ? this.slaService.calculateSlaStatus(
          slaDueAt,
          slaConfig.resolutionTimeMinutes,
          new Date(),
        )
      : null;

    const updatedTicket = await this.ticketRepository.transaction(
      async (tx) => {
        const updated = await tx.ticket.update({
          where: { id },
          data: {
            priority: newPriority,
            slaDueAt,
            slaStatus,
          },
        });
        await tx.ticketHistory.create({
          data: {
            ticketId: id,
            userId,
            field: "priority",
            oldValue: oldPriority,
            newValue: newPriority,
          },
        });
        return updated;
      },
    );

    this.eventEmitter.emit("ticket.priority.updated", {
      ticketId: id,
      ticketNumber: updatedTicket.ticketNumber,
      subject: ticket.subject,
      oldPriority,
      newPriority,
      assignedToId: ticket.assignedToId,
      requesterId: ticket.requesterId,
    });

    return updatedTicket;
  }

  async delete(id: string, deletedBy?: string): Promise<void> {
    const ticket = await this.ticketRepository.findById(id, {
      attachments: { select: { path: true } },
    });

    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }

    const ticketNumber = ticket.ticketNumber;
    const userId = deletedBy || ticket.requesterId;

    // Delete the ticket. Cascade rules on Comment, Attachment, and
    // TicketHistory handle related records automatically. The deletion
    // audit trail is preserved via the ticket.deleted event emitter
    // below and the server log.
    await this.ticketRepository.transaction(async (tx) => {
      await tx.ticket.delete({ where: { id } });
    });

    // Best-effort file cleanup after DB commit
    const ticketAttachments =
      (ticket as { attachments?: Array<{ path: string }> }).attachments ?? [];
    for (const attachment of ticketAttachments) {
      try {
        await this.storageService.delete(attachment.path);
      } catch {
        // Best-effort file cleanup after DB commit
      }
    }

    this.eventEmitter.emit("ticket.deleted", {
      ticketId: id,
      ticketNumber,
      deletedBy: userId,
    });
  }

  private async createTicketWithNumber(
    createTicketDto: CreateTicketDto,
    requesterId: string,
    slaConfig: { resolutionTimeMinutes: number } | null,
  ) {
    for (
      let attempt = 0;
      attempt < appConfig.tickets.creationRetries;
      attempt += 1
    ) {
      try {
        return await this.ticketRepository.transaction(async (tx) => {
          const ticketNumber = await this.generateTicketNumber(tx);
          const slaDueAt = slaConfig
            ? new Date(Date.now() + slaConfig.resolutionTimeMinutes * 60 * 1000)
            : null;
          const slaStatus = slaConfig ? SLAStatus.OnTrack : null;
          const ticket = await tx.ticket.create({
            data: {
              ticketNumber,
              subject: createTicketDto.subject,
              description: createTicketDto.description,
              requester: { connect: { id: requesterId } },
              category: { connect: { id: createTicketDto.categoryId } },
              subCategory: createTicketDto.subCategoryId
                ? { connect: { id: createTicketDto.subCategoryId } }
                : undefined,
              location: createTicketDto.locationId
                ? { connect: { id: createTicketDto.locationId } }
                : undefined,
              itemCode: createTicketDto.itemCode,
              priority: createTicketDto.priority || Priority.Medium,
              slaDueAt,
              slaStatus,
              status: TicketStatus.Open,
            },
            include: {
              requester: { select: { id: true, name: true, email: true } },
              category: true,
              subCategory: true,
              location: { select: { id: true, name: true } },
            },
          });

          await tx.ticketHistory.create({
            data: {
              ticketId: ticket.id,
              userId: requesterId,
              field: "status",
              oldValue: null,
              newValue: TicketStatus.Open,
            },
          });

          return ticket;
        });
      } catch (error) {
        if (
          attempt < appConfig.tickets.creationRetries - 1 &&
          this.isRetryableTicketNumberError(error)
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException("Failed to create ticket");
  }

  private isRetryableTicketNumberError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    );
  }

  private async generateTicketNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const result = await tx.$queryRaw<{ seq: bigint }[]>`
      SELECT nextval('ticket_number_seq') AS seq
    `;

    return `TKT-${String(Number(result[0].seq)).padStart(3, "0")}`;
  }
}
