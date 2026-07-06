import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Prisma, Role } from '@prisma/client';
import { NotificationRepository } from '../common/repositories/notification.repository';
import { UserRepository } from '../common/repositories/user.repository';
import { runWithConcurrency } from '../common/utils/concurrency.util';
import {
  isEventEnabled,
  getEventsForRole,
  normalizePreferences,
} from '../common/utils/notification-preference.util';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly userRepository: UserRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private isEnabled(prefs: unknown, event: string): boolean {
    return isEventEnabled(prefs, event);
  }

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
      data: data.data as Prisma.InputJsonValue,
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

  async getPreferences(userId: string, role: Role) {
    const prefsMap = await this.userRepository.getNotificationPreferences([
      userId,
    ]);
    const stored = prefsMap.get(userId);
    return {
      preferences: normalizePreferences(stored, role),
      availableEvents: getEventsForRole(role),
    };
  }

  async updatePreferences(
    userId: string,
    role: Role,
    dto: UpdateNotificationPreferencesDto,
  ) {
    const allowed = new Set(getEventsForRole(role).map((e) => e.event));
    const input = dto.preferences ?? {};
    const normalized: Record<string, boolean> = {};

    for (const [event, value] of Object.entries(input)) {
      if (!allowed.has(event)) {
        throw new BadRequestException(`Unknown notification event: ${event}`);
      }
      if (typeof value !== 'boolean') {
        throw new BadRequestException(
          `Preference for ${event} must be a boolean`,
        );
      }
      normalized[event] = value;
    }

    // Default any missing role-relevant key to true (on).
    for (const event of allowed) {
      if (!(event in normalized)) {
        normalized[event] = true;
      }
    }

    await this.userRepository.setNotificationPreferences(userId, normalized);

    return {
      preferences: normalized,
      availableEvents: getEventsForRole(role),
    };
  }

  @OnEvent('ticket.created')
  async handleTicketCreated(payload: {
    ticketId: string;
    ticketNumber: string;
    subject: string;
    requesterId: string;
  }) {
    const itsupportUsers = await this.userRepository.findSupportUsers();

    await runWithConcurrency(itsupportUsers, 5, async (user) => {
      if (!this.isEnabled(user.notificationPreferences, 'ticket.created')) return;
      try {
        await this.create({
          userId: user.id,
          title: 'New Ticket Created',
          message: `Ticket ${payload.ticketNumber}: ${payload.subject}`,
          data: { ticketId: payload.ticketId, type: 'ticket_created' },
        });
      } catch (err) {
        this.logger.error(`Failed to create ticket.created notification for user ${user.id}: ${err}`);
      }
    });

    const requesterIsNotSupport = !itsupportUsers.some(
      (u) => u.id === payload.requesterId,
    );
    if (requesterIsNotSupport) {
      const prefsMap = await this.userRepository.getNotificationPreferences([
        payload.requesterId,
      ]);
      const requesterPrefs = prefsMap.get(payload.requesterId);
      if (this.isEnabled(requesterPrefs, 'ticket.created')) {
        try {
          await this.create({
            userId: payload.requesterId,
            title: 'Ticket Created',
            message: `Your ticket ${payload.ticketNumber} has been created: ${payload.subject}`,
            data: { ticketId: payload.ticketId, type: 'ticket_created' },
          });
        } catch (err) {
          this.logger.error(`Failed to create ticket.created notification for requester ${payload.requesterId}: ${err}`);
        }
      }
    }
  }

  @OnEvent('ticket.assigned')
  async handleTicketAssigned(payload: {
    ticketId: string;
    ticketNumber: string;
    assignedToId: string;
    assignedBy: string;
  }) {
    const prefsMap = await this.userRepository.getNotificationPreferences([
      payload.assignedToId,
    ]);
    const assigneePrefs = prefsMap.get(payload.assignedToId);
    if (this.isEnabled(assigneePrefs, 'ticket.assigned')) {
      try {
        await this.create({
          userId: payload.assignedToId,
          title: 'Ticket Assigned',
          message: `Ticket ${payload.ticketNumber} has been assigned to you`,
          data: { ticketId: payload.ticketId, type: 'ticket_assigned' },
        });
      } catch (err) {
        this.logger.error(`Failed to create ticket.assigned notification for user ${payload.assignedToId}: ${err}`);
      }
    }
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
    const targetIds = [
      payload.assignedToId,
      payload.requesterId,
    ].filter((id): id is string => !!id);
    const uniqueIds = [...new Set(targetIds)];
    const prefsMap =
      await this.userRepository.getNotificationPreferences(uniqueIds);

    const notified = new Set<string>();

    if (payload.assignedToId) {
      const assigneePrefs = prefsMap.get(payload.assignedToId);
      if (this.isEnabled(assigneePrefs, 'ticket.status.updated')) {
        try {
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
        } catch (err) {
          this.logger.error(`Failed to create ticket.status.updated notification for assignee ${payload.assignedToId}: ${err}`);
          // Do NOT mark as notified — let the requester get the notification
        }
      }
    }

    if (!notified.has(payload.requesterId)) {
      const requesterPrefs = prefsMap.get(payload.requesterId);
      if (this.isEnabled(requesterPrefs, 'ticket.status.updated')) {
        try {
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
        } catch (err) {
          this.logger.error(`Failed to create ticket.status.updated notification for requester ${payload.requesterId}: ${err}`);
        }
      }
    }
  }
}
