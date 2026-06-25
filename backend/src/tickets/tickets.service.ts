import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TicketRepository } from '../common/repositories/ticket.repository';
import { CategoryRepository } from '../common/repositories/category.repository';
import { SubCategoryRepository } from '../common/repositories/sub-category.repository';
import { UserRepository } from '../common/repositories/user.repository';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { UpdatePriorityDto } from './dto/update-priority.dto';
import { TicketStatus, Priority, SLAStatus, CommentType, Prisma } from '@prisma/client';
import type { StorageService } from '../attachments/interfaces/storage-service.interface';

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
    private readonly eventEmitter: EventEmitter2,
    @Inject('StorageService')
    private readonly storageService: StorageService,
  ) {}

  async create(createTicketDto: CreateTicketDto, requesterId: string) {
    const category = await this.categoryRepository.findById(createTicketDto.categoryId, {
      slaConfigs: { where: { priority: createTicketDto.priority || Priority.Medium, isActive: true } },
    });

    if (!category || !category.isActive) {
      throw new BadRequestException('Category not found');
    }

    if (createTicketDto.subCategoryId) {
      const subCategory = await this.subCategoryRepository.findById(createTicketDto.subCategoryId);
      if (!subCategory || !subCategory.isActive || subCategory.categoryId !== createTicketDto.categoryId) {
        throw new BadRequestException('Invalid sub-category for the selected category');
      }
    }

    const slaConfig = category.slaConfigs?.[0];
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

    if (userRole === 'EndUser') {
      where.requesterId = userId;
    }

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

    const allowedSortFields = ['createdAt', 'updatedAt', 'slaDueAt', 'priority', 'ticketNumber', 'subject', 'status'];
    const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderBy: Record<string, string> = { [orderField]: sortOrder };

    const [tickets, total] = await Promise.all([
      this.ticketRepository.findMany({
        where: where as any,
        skip: limit > 0 ? (page - 1) * limit : 0,
        take: limit > 0 ? limit : undefined,
        orderBy,
        include: {
          requester: { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
          category: { select: { id: true, name: true } },
          subCategory: { select: { id: true, name: true } },
          _count: { select: { comments: true, attachments: true } },
        },
      }),
      this.ticketRepository.count(where as any),
    ]);

    if (userRole === 'EndUser') {
      for (const ticket of tickets) {
        const visibleComments = await this.ticketRepository.findUnique({
          where: { id: ticket.id },
          select: { _count: { select: { comments: { where: { type: CommentType.PUBLIC } } } } },
        });
        const visibleAttachments = await this.ticketRepository.findUnique({
          where: { id: ticket.id },
          select: { _count: { select: { attachments: { where: { OR: [{ commentId: null }, { comment: { type: CommentType.PUBLIC } }] } } } } },
        });
        ticket._count.comments = visibleComments?._count.comments ?? 0;
        ticket._count.attachments = visibleAttachments?._count.attachments ?? 0;
      }
    }

    return { data: tickets, meta: { page: limit > 0 ? page : 1, limit, total } };
  }

  async exportCsv(queryTicketDto: QueryTicketDto, userRole: string, userId: string) {
    const {
      status, priority, categoryId, assignedToId, requesterId,
      slaStatus, dateFrom, dateTo, search,
      sortBy = 'createdAt', sortOrder = 'desc',
    } = queryTicketDto;

    const where: Record<string, unknown> = {};

    if (userRole === 'EndUser') where.requesterId = userId;
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

    const allowedSortFields = ['createdAt', 'updatedAt', 'slaDueAt', 'priority'];
    const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderBy: Record<string, string> = { [orderField]: sortOrder };

    const tickets = await this.ticketRepository.findMany({
      where: where as any,
      orderBy,
      include: {
        requester: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        category: { select: { id: true, name: true } },
        subCategory: { select: { id: true, name: true } },
      },
    });

    const escapeCsv = (value: unknown) => {
      const raw = String(value ?? '');
      const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const headers = ['Ticket #', 'Subject', 'Status', 'Priority', 'Category', 'Sub Category', 'Created By', 'Assigned To', 'Created At', 'Resolved At', 'SLA Status'];
    const rows = tickets.map((t: any) => [
      t.ticketNumber,
      t.subject,
      t.status,
      t.priority,
      t.category?.name || '',
      t.subCategory?.name || '',
      t.requester?.name || '',
      t.assignedTo?.name || '',
      t.createdAt.toISOString(),
      t.resolvedAt?.toISOString() || '',
      t.slaStatus || '',
    ]);

    return [headers.map(escapeCsv).join(','), ...rows.map((r: any) => r.map(escapeCsv).join(','))].join('\n');
  }

  async findById(id: string, userRole?: string, userId?: string) {
    const include: Record<string, unknown> = {
      requester: { select: { id: true, name: true, email: true, avatarUrl: true } },
      assignedTo: { select: { id: true, name: true, email: true, avatarUrl: true } },
      category: { select: { id: true, name: true } },
      subCategory: { select: { id: true, name: true } },
      comments: {
        where: userRole === 'EndUser' ? { type: CommentType.PUBLIC } : undefined,
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      },
      attachments: {
        where: userRole === 'EndUser'
          ? { OR: [{ commentId: null }, { comment: { type: CommentType.PUBLIC } }] }
          : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true } },
        },
      },
      _count: { select: { comments: true, attachments: true } },
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

    if (userRole === 'EndUser') {
      const visibleCounts = await this.ticketRepository.findUnique({
        where: { id: ticket.id },
        select: {
          _count: {
            select: {
              comments: { where: { type: CommentType.PUBLIC } },
              attachments: { where: { OR: [{ commentId: null }, { comment: { type: CommentType.PUBLIC } }] } },
            },
          },
        },
      });
      ticket._count.comments = visibleCounts?._count.comments ?? 0;
      ticket._count.attachments = visibleCounts?._count.attachments ?? 0;
    }

    return ticket;
  }

  async updateStatus(id: string, updateStatusDto: UpdateStatusDto, userId: string, userRole: string) {
    const ticket = await this.ticketRepository.findById(id);
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

    const validNextStates = VALID_TRANSITIONS[ticket.status as TicketStatus];
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

    if (ticket.status === TicketStatus.Closed && updateStatusDto.status !== TicketStatus.Closed) {
      updateData.closedAt = null;
      updateData.resolvedAt = null;
    }

    const oldStatus = ticket.status;

    const updatedTicket = await this.ticketRepository.transaction(async (tx) => {
      const updated = await tx.ticket.update({ where: { id }, data: updateData as any });
      await tx.ticketHistory.create({
        data: {
          ticketId: id,
          userId,
          field: 'status',
          oldValue: oldStatus,
          newValue: updateStatusDto.status,
        },
      });
      return updated;
    });

    this.eventEmitter.emit('ticket.status.updated', {
      ticketId: id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      oldStatus: ticket.status,
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
        assignedToId: assignTicketDto.assignedToId,
        assignedBy: userId,
      });
    }

    return updatedTicket;
  }

  async updatePriority(id: string, updatePriorityDto: UpdatePriorityDto, userId: string) {
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const oldPriority = ticket.priority;

    const updatedTicket = await this.ticketRepository.transaction(async (tx) => {
      const updated = await tx.ticket.update({
        where: { id },
        data: { priority: updatePriorityDto.priority },
      });
      await tx.ticketHistory.create({
        data: {
          ticketId: id,
          userId,
          field: 'priority',
          oldValue: oldPriority,
          newValue: updatePriorityDto.priority,
        },
      });
      return updated;
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

    for (const attachment of ticket.attachments || []) {
      try {
        await this.storageService.delete(attachment.path);
      } catch {
        // Ignore file deletion errors
      }
    }

    await this.ticketRepository.transaction(async (tx) => {
      await tx.ticketHistory.deleteMany({ where: { ticketId: id } });
      await tx.comment.deleteMany({ where: { ticketId: id } });
      await tx.attachment.deleteMany({ where: { ticketId: id } });
      await tx.ticket.delete({ where: { id } });
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
        }, { isolationLevel: 'Serializable' });
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
    const result = await tx.$queryRaw<{ max_seq: bigint }[]>`
      SELECT COALESCE(MAX(CAST(SUBSTRING("ticketNumber" FROM 5) AS INTEGER)), 0) as max_seq
      FROM "tickets"
    `;

    const nextSeq = Number(result[0].max_seq) + 1;
    return `TKT-${String(nextSeq).padStart(3, '0')}`;
  }
}
