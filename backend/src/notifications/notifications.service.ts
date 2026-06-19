import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(data: {
    userId: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        message: data.message,
        data: (data.data as Prisma.InputJsonValue) || undefined,
      },
    });

    this.eventEmitter.emit('notification.created', notification);

    return notification;
  }

  async findByUserId(
    userId: string,
    params: { page?: number; limit?: number; unreadOnly?: boolean },
  ) {
    const { page = 1, limit = 20, unreadOnly = false } = params;

    const where: Record<string, unknown> = { userId };
    if (unreadOnly) {
      where.isRead = false;
    }

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data: notifications, meta: { page, limit, total } };
  }

  async markAsRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  @OnEvent('ticket.created')
  async handleTicketCreated(payload: {
    ticketId: string;
    ticketNumber: string;
    subject: string;
    requesterId: string;
  }) {
    const itsupportUsers = await this.prisma.user.findMany({
      where: { role: { in: ['ITSupport', 'Admin'] }, isActive: true },
      select: { id: true },
    });

    for (const user of itsupportUsers) {
      await this.create({
        userId: user.id,
        title: 'New Ticket Created',
        message: `Ticket ${payload.ticketNumber}: ${payload.subject}`,
        data: { ticketId: payload.ticketId, type: 'ticket_created' },
      });
    }
  }

  @OnEvent('ticket.assigned')
  async handleTicketAssigned(payload: {
    ticketId: string;
    ticketNumber: string;
    assignedToId: string;
    assignedBy: string;
  }) {
    await this.create({
      userId: payload.assignedToId,
      title: 'Ticket Assigned',
      message: `Ticket ${payload.ticketNumber} has been assigned to you`,
      data: { ticketId: payload.ticketId, type: 'ticket_assigned' },
    });
  }

  @OnEvent('ticket.status.updated')
  async handleTicketStatusUpdated(payload: {
    ticketId: string;
    ticketNumber: string;
    oldStatus: string;
    newStatus: string;
    assignedToId: string;
    updatedBy: string;
  }) {
    await this.create({
      userId: payload.assignedToId,
      title: 'Ticket Status Updated',
      message: `Ticket ${payload.ticketNumber} status changed from ${payload.oldStatus} to ${payload.newStatus}`,
      data: {
        ticketId: payload.ticketId,
        type: 'ticket_status_updated',
        oldStatus: payload.oldStatus,
        newStatus: payload.newStatus,
      },
    });
  }
}
