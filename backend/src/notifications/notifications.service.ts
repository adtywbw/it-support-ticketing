import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { NotificationRepository } from '../common/repositories/notification.repository';
import { UserRepository } from '../common/repositories/user.repository';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly userRepository: UserRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(data: {
    userId: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }) {
    const notification = await this.notificationRepository.create({
      user: { connect: { id: data.userId } },
      title: data.title,
      message: data.message,
      data: data.data as any,
    });

    this.eventEmitter.emit('notification.created', notification);

    return notification;
  }

  async findByUserId(
    userId: string,
    params: { page?: number; limit?: number; unreadOnly?: boolean },
  ) {
    return this.notificationRepository.findByUserId(userId, params);
  }

  async markAsRead(id: string, userId: string) {
    return this.notificationRepository.markAsRead(id, userId);
  }

  async markAllAsRead(userId: string) {
    return this.notificationRepository.markAllAsRead(userId);
  }

  async clearAll(userId: string) {
    return this.notificationRepository.clearAll(userId);
  }

  async getUnreadCount(userId: string) {
    return this.notificationRepository.getUnreadCount(userId);
  }

  @OnEvent('ticket.created')
  async handleTicketCreated(payload: {
    ticketId: string;
    ticketNumber: string;
    subject: string;
    requesterId: string;
  }) {
    const itsupportUsers = await this.userRepository.findSupportUsers();

    for (const user of itsupportUsers) {
      await this.create({
        userId: user.id,
        title: 'New Ticket Created',
        message: `Ticket ${payload.ticketNumber}: ${payload.subject}`,
        data: { ticketId: payload.ticketId, type: 'ticket_created' },
      });
    }

    const requesterIsNotSupport = !itsupportUsers.some(
      (u) => u.id === payload.requesterId,
    );
    if (requesterIsNotSupport) {
      await this.create({
        userId: payload.requesterId,
        title: 'Ticket Created',
        message: `Your ticket ${payload.ticketNumber} has been created: ${payload.subject}`,
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
    assignedToId: string | null;
    requesterId: string;
    updatedBy: string;
  }) {
    const notified = new Set<string>();

    if (payload.assignedToId) {
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
      notified.add(payload.assignedToId);
    }

    if (!notified.has(payload.requesterId)) {
      await this.create({
        userId: payload.requesterId,
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
}
