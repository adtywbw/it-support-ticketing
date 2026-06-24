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
import { TicketStatus, Priority, SLAStatus, CommentType } from '@prisma/client';
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

    if (!category) {
      throw new BadRequestException('Category not found');
    }

    if (createTicketDto.subCategoryId) {
      const subCategory = await this.subCategoryRepository.findById(createTicketDto.subCategoryId);
      if (!subCategory || subCategory.categoryId !== createTicketDto.categoryId) {
        throw new BadRequestException('Invalid sub-category for the selected category');
      }
    }

    const slaConfig = category.slaConfigs?.[0];
    const slaDueAt = slaConfig
      ? new Date(Date.now() + slaConfig.resolutionTimeMinutes * 60 * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    const ticketNumber = await this.generateTicketNumber();

    const ticket = await this.ticketRepository.create(
      {
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
      {
        requester: { select: { id: true, name: true, email: true } },
        category: true,
        subCategory: true,
      },
    );

    await this.ticketRepository.transaction(async (tx) => {
      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          userId: requesterId,
          field: 'status',
          oldValue: null,
          newValue: TicketStatus.Open,
        },
      });
    });

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
        skip: (page - 1) * limit,
        take: limit,
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

    return { data: tickets, meta: { page, limit, total } };
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

    const headers = ['Ticket #', 'Subject', 'Status', 'Priority', 'Category', 'Sub Category', 'Created By', 'Assigned To', 'Created At', 'Resolved At', 'SLA Status'];
    const rows = tickets.map((t: any) => [
      t.ticketNumber,
      `"${(t.subject || '').replace(/"/g, '""')}"`,
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

    return [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
  }

  async findById(id: string, userRole?: string, userId?: string) {
    const ticket = await this.ticketRepository.findById(id, {
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
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true } },
        },
      },
      histories: {
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true } },
        },
      },
      _count: { select: { comments: true, attachments: true } },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (userRole === 'EndUser' && ticket.requesterId !== userId) {
      throw new ForbiddenException('Access denied');
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

    const updatedTicket = await this.ticketRepository.update(id, updateData as any);

    await this.ticketRepository.transaction(async (tx) => {
      await tx.ticketHistory.create({
        data: {
          ticketId: id,
          userId,
          field: 'status',
          oldValue: ticket.status,
          newValue: updateStatusDto.status,
        },
      });
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

    const assignedUser = await this.userRepository.getForValidation(assignTicketDto.assignedToId);
    if (!assignedUser || assignedUser.role === 'EndUser') {
      throw new BadRequestException('Cannot assign ticket to this user');
    }

    const oldAssigneeId = ticket.assignedToId;

    const updatedTicket = await this.ticketRepository.update(id, {
      assignedTo: { connect: { id: assignTicketDto.assignedToId } },
    } as any);

    await this.ticketRepository.transaction(async (tx) => {
      await tx.ticketHistory.create({
        data: {
          ticketId: id,
          userId,
          field: 'assignedTo',
          oldValue: oldAssigneeId || null,
          newValue: assignTicketDto.assignedToId,
        },
      });
    });

    this.eventEmitter.emit('ticket.assigned', {
      ticketId: id,
      ticketNumber: ticket.ticketNumber,
      assignedToId: assignTicketDto.assignedToId,
      assignedBy: userId,
    });

    return updatedTicket;
  }

  async updatePriority(id: string, updatePriorityDto: UpdatePriorityDto, userId: string) {
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const updatedTicket = await this.ticketRepository.update(id, {
      priority: updatePriorityDto.priority,
    });

    await this.ticketRepository.transaction(async (tx) => {
      await tx.ticketHistory.create({
        data: {
          ticketId: id,
          userId,
          field: 'priority',
          oldValue: ticket.priority,
          newValue: updatePriorityDto.priority,
        },
      });
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

  private async generateTicketNumber(): Promise<string> {
    return this.ticketRepository.transaction(async (tx) => {
      const lastTicket = await tx.ticket.findFirst({
        orderBy: { ticketNumber: 'desc' },
        select: { ticketNumber: true },
      });

      let nextSeq = 1;
      if (lastTicket) {
        const parts = lastTicket.ticketNumber.split('-');
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        nextSeq = lastSeq + 1;
      }

      return `TKT-${String(nextSeq).padStart(3, '0')}`;
    }, { isolationLevel: 'Serializable' });
  }
}
