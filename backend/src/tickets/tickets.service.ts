import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Response } from 'express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TicketRepository, TicketAccessScope } from '../common/repositories/ticket.repository';
import { CategoryRepository } from '../common/repositories/category.repository';
import { SubCategoryRepository } from '../common/repositories/sub-category.repository';
import { UserRepository } from '../common/repositories/user.repository';
import { SLAService } from '../sla/sla.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { UpdatePriorityDto } from './dto/update-priority.dto';
import { TicketStatus, Priority, SLAStatus,       CommentType, Prisma } from '@prisma/client';
import { STORAGE_SERVICE } from '../attachments/interfaces/storage-service.interface';
import type { StorageService } from '../attachments/interfaces/storage-service.interface';
import { AttachmentVisibilityPolicy, UserRole } from '../common/policies/attachment-visibility.policy';

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.Open]: [TicketStatus.InProgress],
  [TicketStatus.InProgress]: [TicketStatus.OnHold, TicketStatus.Resolved],
  [TicketStatus.OnHold]: [TicketStatus.InProgress],
  [TicketStatus.Resolved]: [TicketStatus.Closed],
  [TicketStatus.Closed]: [TicketStatus.Open],
};

@Injectable()
export class TicketsService {
  constructor(
    private readonly ticketRepository: TicketRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly subCategoryRepository: SubCategoryRepository,
    private readonly userRepository: UserRepository,
    private readonly slaService: SLAService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageService,
  ) {}

  async create(createTicketDto: CreateTicketDto, requesterId: string) {
    const category = await this.categoryRepository.findById(createTicketDto.categoryId, {});

    if (!category || !category.isActive) {
      throw new BadRequestException('Category not found');
    }

    if (createTicketDto.subCategoryId) {
      const subCategory = await this.subCategoryRepository.findById(createTicketDto.subCategoryId);
      if (!subCategory || !subCategory.isActive || subCategory.categoryId !== createTicketDto.categoryId) {
        throw new BadRequestException('Invalid sub-category for the selected category');
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
    const slaDueAt = slaConfig
      ? new Date(Date.now() + slaConfig.resolutionTimeMinutes * 60 * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    const ticket = await this.createTicketWithNumber(
      createTicketDto,
      requesterId,
      slaDueAt,
    );

    this.eventEmitter.emit('ticket.created', {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      priority: ticket.priority,
      requesterId,
      requesterEmail: ticket.requester.email,
    });

    return ticket;
  }

  async findAll(queryTicketDto: QueryTicketDto, userRole: string, userId: string) {
    const {
      page = 1,
      limit = 10,
      status,
      priority,
      categoryId,
      assignedToId,
      requesterId,
      slaStatus,
      dateFrom,
      dateTo,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = queryTicketDto;

    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (categoryId) where.categoryId = categoryId;
    if (assignedToId) where.assignedToId = assignedToId;
    if (requesterId && userRole !== 'EndUser') where.requesterId = requesterId;
    if (slaStatus) where.slaStatus = slaStatus;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        const startDate = new Date(dateFrom);
        startDate.setUTCHours(0, 0, 0, 0);
        (where.createdAt as Record<string, unknown>).gte = startDate;
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setUTCHours(23, 59, 59, 999);
        (where.createdAt as Record<string, unknown>).lte = endDate;
      }
    }

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { ticketNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = ['createdAt', 'updatedAt', 'slaDueAt', 'priority', 'ticketNumber', 'subject', 'status', 'slaStatus'];
    const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

    const scope: TicketAccessScope = { userId, role: userRole as TicketAccessScope['role'] };
    const include = {
      requester: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      category: { select: { id: true, name: true } },
      subCategory: { select: { id: true, name: true } },
      _count: { select: { comments: true, attachments: true } },
    };

    const [tickets, total] = await Promise.all([
      orderField === 'slaStatus'
        ? this.ticketRepository.findManySortedBySlaStatus({
            scope,
            filters: {
              status,
              priority,
              categoryId,
              assignedToId,
              requesterId: userRole !== 'EndUser' ? requesterId : undefined,
              slaStatus,
              dateFrom,
              dateTo,
              search,
            },
            skip: limit > 0 ? (page - 1) * limit : 0,
            take: limit > 0 ? limit : undefined,
            sortOrder,
            include,
          })
        : this.ticketRepository.findManyForUser({
            where: where as any,
            skip: limit > 0 ? (page - 1) * limit : 0,
            take: limit > 0 ? limit : undefined,
            orderBy: { [orderField]: sortOrder },
            include,
          }, scope),
      this.ticketRepository.countForUser(where as any, scope),
    ]);

    if (userRole === 'EndUser' && tickets.length > 0) {
      const ticketIds = tickets.map((t: any) => t.id);
      const [commentCounts, attachmentCounts] = await Promise.all([
        this.ticketRepository.countPublicCommentsByTicketIds(ticketIds),
        this.ticketRepository.countVisibleAttachmentsByTicketIds(ticketIds),
      ]);
      const commentsByTicket = new Map(commentCounts.map((r) => [r.ticketId, r.count]));
      const attachmentsByTicket = new Map(attachmentCounts.map((r) => [r.ticketId, r.count]));
      for (const ticket of tickets) {
        ticket._count.comments = commentsByTicket.get(ticket.id) ?? 0;
        ticket._count.attachments = attachmentsByTicket.get(ticket.id) ?? 0;
      }
    }

    const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;
    return { data: tickets, meta: { page: limit > 0 ? page : 1, limit, total, totalPages } };
  }

  async exportCsvToResponse(res: Response, queryTicketDto: QueryTicketDto, userRole: string, userId: string) {
    const MAX_EXPORT_ROWS = 10000;
    const BATCH_SIZE = 500;
    const {
      status, priority, categoryId, assignedToId, requesterId,
      slaStatus, dateFrom, dateTo, search,
      sortBy = 'createdAt', sortOrder = 'desc',
    } = queryTicketDto;

    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (categoryId) where.categoryId = categoryId;
    if (assignedToId) where.assignedToId = assignedToId;
    if (requesterId && userRole !== 'EndUser') where.requesterId = requesterId;
    if (slaStatus) where.slaStatus = slaStatus;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        const startDate = new Date(dateFrom);
        startDate.setUTCHours(0, 0, 0, 0);
        (where.createdAt as Record<string, unknown>).gte = startDate;
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setUTCHours(23, 59, 59, 999);
        (where.createdAt as Record<string, unknown>).lte = endDate;
      }
    }
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { ticketNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = ['createdAt', 'updatedAt', 'slaDueAt', 'priority', 'slaStatus'];
    const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const escapeCsv = (value: unknown) => {
      const raw = String(value ?? '');
      const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const headers = ['Ticket #', 'Subject', 'Status', 'Priority', 'Category', 'Sub Category', 'Created By', 'Assigned To', 'Created At', 'Resolved At', 'SLA Status'];
    res.write(headers.map(escapeCsv).join(',') + '\n');

    let totalExported = 0;
    let offset = 0;
    const scope: TicketAccessScope = { userId, role: userRole as TicketAccessScope['role'] };

    while (totalExported < MAX_EXPORT_ROWS) {
      const exportInclude = {
        requester: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        category: { select: { id: true, name: true } },
        subCategory: { select: { id: true, name: true } },
      };

      const batch = orderField === 'slaStatus'
        ? await this.ticketRepository.findManySortedBySlaStatus({
            scope,
            filters: {
              status,
              priority,
              categoryId,
              assignedToId,
              requesterId: userRole !== 'EndUser' ? requesterId : undefined,
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
        : await this.ticketRepository.findManyForUser({
            where: where as any,
            orderBy: [
              { [orderField]: orderDir },
              { id: orderDir },
            ] as any,
            skip: offset,
            take: Math.min(BATCH_SIZE, MAX_EXPORT_ROWS - totalExported),
            include: exportInclude,
          }, scope);

      if (batch.length === 0) break;

      for (const ticket of batch) {
        const row = [
          ticket.ticketNumber,
          ticket.subject,
          ticket.status,
          ticket.priority,
          ticket.category?.name || '',
          ticket.subCategory?.name || '',
          ticket.requester?.name || '',
          ticket.assignedTo?.name || '',
          ticket.createdAt.toISOString(),
          ticket.resolvedAt?.toISOString() || '',
          ticket.slaStatus || '',
        ];
        res.write(row.map(escapeCsv).join(',') + '\n');
        totalExported++;
      }

      offset += batch.length;
      if (batch.length < BATCH_SIZE) break;
    }

    res.end();
  }

  async findById(id: string, userRole?: string, userId?: string) {
    const include: Record<string, unknown> = {
      requester: { select: { id: true, name: true, email: true, avatarUrl: true } },
      assignedTo: { select: { id: true, name: true, email: true, avatarUrl: true } },
      category: { select: { id: true, name: true } },
      subCategory: { select: { id: true, name: true } },
      _count: userRole === 'EndUser'
        ? {
            select: {
              comments: { where: { type: CommentType.PUBLIC } },
              attachments: { where: AttachmentVisibilityPolicy.buildVisibleAttachmentCountWhere() },
            },
          }
        : { select: { comments: true, attachments: true } },
    };

    if (userRole !== 'EndUser') {
      include.histories = {
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true } },
        },
      };
    }

    const ticket = await this.ticketRepository.findById(id, include);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (userRole === 'EndUser' && ticket.requesterId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return ticket;
  }

  async updateStatus(id: string, updateStatusDto: UpdateStatusDto, userId: string, userRole: string) {
    const context: { ticket?: any; oldStatus?: TicketStatus } = {};

    const updatedTicket = await this.ticketRepository.transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id } });
      if (!ticket) {
        throw new NotFoundException('Ticket not found');
      }

      if (userRole === 'EndUser') {
        if (ticket.requesterId !== userId) {
          throw new ForbiddenException('Access denied');
        }
        if (updateStatusDto.status !== TicketStatus.Closed) {
          throw new ForbiddenException('End users can only close their own tickets');
        }
        if (ticket.status !== TicketStatus.Resolved) {
          throw new ForbiddenException('End users can only close resolved tickets');
        }
      }

      const oldStatus = ticket.status as TicketStatus;
      const validNextStates = VALID_TRANSITIONS[oldStatus];
      if (!validNextStates.includes(updateStatusDto.status)) {
        throw new BadRequestException(
          `Cannot transition from ${ticket.status} to ${updateStatusDto.status}`,
        );
      }

      const updateData: Record<string, unknown> = {
        status: updateStatusDto.status,
      };

      if (updateStatusDto.status === TicketStatus.Resolved) {
        updateData.resolvedAt = new Date();
      }

      if (updateStatusDto.status === TicketStatus.Closed) {
        updateData.closedAt = new Date();
      }

      if (oldStatus === TicketStatus.Closed && updateStatusDto.status !== TicketStatus.Closed) {
        updateData.closedAt = null;
        updateData.resolvedAt = null;
      }

      const updated = await tx.ticket.updateMany({
        where: { id, status: oldStatus },
        data: updateData as any,
      });
      if (updated.count !== 1) {
        throw new ConflictException('Ticket status changed. Please refresh and retry.');
      }

      await tx.ticketHistory.create({
        data: {
          ticketId: id,
          userId,
          field: 'status',
          oldValue: oldStatus,
          newValue: updateStatusDto.status,
        },
      });
      context.ticket = ticket;
      context.oldStatus = oldStatus;
      return tx.ticket.findUnique({ where: { id } });
    });

    const ticket = context.ticket;
    const oldStatus = context.oldStatus;

    this.eventEmitter.emit('ticket.status.updated', {
      ticketId: id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      oldStatus,
      newStatus: updateStatusDto.status,
      assignedToId: ticket.assignedToId,
      requesterId: ticket.requesterId,
      updatedBy: userId,
    });

    return updatedTicket;
  }

  async assignTicket(id: string, assignTicketDto: AssignTicketDto, userId: string) {
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (assignTicketDto.assignedToId) {
      const assignedUser = await this.userRepository.getForValidation(assignTicketDto.assignedToId);
      if (!assignedUser || assignedUser.role === 'EndUser' || !assignedUser.isActive) {
        throw new BadRequestException('Cannot assign ticket to this user');
      }
    }

    const oldAssigneeId = ticket.assignedToId;

    const updatedTicket = await this.ticketRepository.transaction(async (tx) => {
      const updated = await tx.ticket.update({
        where: { id },
        data: {
          assignedTo: assignTicketDto.assignedToId
            ? { connect: { id: assignTicketDto.assignedToId } }
            : { disconnect: true },
        },
      });
      await tx.ticketHistory.create({
        data: {
          ticketId: id,
          userId,
          field: 'assignedTo',
          oldValue: oldAssigneeId || null,
          newValue: assignTicketDto.assignedToId || null,
        },
      });
      return updated;
    });

    if (assignTicketDto.assignedToId) {
      this.eventEmitter.emit('ticket.assigned', {
        ticketId: id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        assignedToId: assignTicketDto.assignedToId,
        assignedBy: userId,
      });
    }

    return updatedTicket;
  }

  async updatePriority(id: string, updatePriorityDto: UpdatePriorityDto, userId: string) {
    const ticket = await this.ticketRepository.findById(id, {});
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
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
      : new Date(createdAt + 24 * 60 * 60 * 1000);

    const now = Date.now();
    const remainingMs = slaDueAt.getTime() - now;
    const totalWindowMs = slaConfig ? slaConfig.resolutionTimeMinutes * 60 * 1000 : 24 * 60 * 60 * 1000;
    const remainingRatio = remainingMs / totalWindowMs;

    let slaStatus: SLAStatus;
    if (remainingMs <= 0) {
      slaStatus = SLAStatus.Breached;
    } else if (remainingRatio <= 0.2) {
      slaStatus = SLAStatus.AtRisk;
    } else {
      slaStatus = SLAStatus.OnTrack;
    }

    const updatedTicket = await this.ticketRepository.transaction(async (tx) => {
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
          field: 'priority',
          oldValue: oldPriority,
          newValue: newPriority,
        },
      });
      return updated;
    });

    this.eventEmitter.emit('ticket.priority.updated', {
      ticketId: id,
      ticketNumber: updatedTicket.ticketNumber,
      oldPriority,
      newPriority,
    });

    return updatedTicket;
  }

  async delete(id: string): Promise<void> {
    const ticket = await this.ticketRepository.findById(id, {
      attachments: { select: { path: true } },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    await this.ticketRepository.transaction(async (tx) => {
      await tx.ticketHistory.deleteMany({ where: { ticketId: id } });
      await tx.comment.deleteMany({ where: { ticketId: id } });
      await tx.attachment.deleteMany({ where: { ticketId: id } });
      await tx.ticket.delete({ where: { id } });
    });

    for (const attachment of ticket.attachments || []) {
      try {
        await this.storageService.delete(attachment.path);
      } catch {
        // Best-effort file cleanup after DB commit
      }
    }

    this.eventEmitter.emit('ticket.deleted', {
      ticketId: id,
      ticketNumber: ticket.ticketNumber,
    });
  }

  private async createTicketWithNumber(
    createTicketDto: CreateTicketDto,
    requesterId: string,
    slaDueAt: Date,
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.ticketRepository.transaction(async (tx) => {
          const ticketNumber = await this.generateTicketNumber(tx);
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
              priority: createTicketDto.priority || Priority.Medium,
              slaDueAt,
              slaStatus: SLAStatus.OnTrack,
              status: TicketStatus.Open,
            },
            include: {
              requester: { select: { id: true, name: true, email: true } },
              category: true,
              subCategory: true,
            },
          });

          await tx.ticketHistory.create({
            data: {
              ticketId: ticket.id,
              userId: requesterId,
              field: 'status',
              oldValue: null,
              newValue: TicketStatus.Open,
            },
          });

          return ticket;
        });
      } catch (error) {
        if (attempt < 2 && this.isRetryableTicketNumberError(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException('Failed to create ticket');
  }

  private isRetryableTicketNumberError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034');
  }

  private async generateTicketNumber(tx: Prisma.TransactionClient): Promise<string> {
    const result = await tx.$queryRaw<{ seq: bigint }[]>`
      SELECT nextval('ticket_number_seq') AS seq
    `;

    return `TKT-${String(Number(result[0].seq)).padStart(3, '0')}`;
  }
}
