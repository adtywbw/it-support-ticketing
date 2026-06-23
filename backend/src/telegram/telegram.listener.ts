import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TelegramService } from './telegram.service';

@Injectable()
export class TelegramListener {
  constructor(private readonly telegramService: TelegramService) {}

  @OnEvent('ticket.created')
  async handleTicketCreated(payload: {
    ticketId: string;
    ticketNumber: string;
    subject: string;
    priority: string;
    requesterId: string;
    requesterEmail?: string;
  }) {
    await this.telegramService.sendEvent('ticket.created', {
      ticketNumber: payload.ticketNumber,
      subject: payload.subject,
      priority: payload.priority,
      createdBy: payload.requesterEmail || '',
      url: `${process.env.APP_URL || ''}/tickets/${payload.ticketId}`,
    });
  }

  @OnEvent('ticket.assigned')
  async handleTicketAssigned(payload: {
    ticketId: string;
    ticketNumber: string;
    subject: string;
    assignedToId: string;
    assignedBy: string;
  }) {
    await this.telegramService.sendEvent('ticket.assigned', {
      ticketNumber: payload.ticketNumber,
      subject: payload.subject,
      assignedTo: payload.assignedToId,
      assignedBy: payload.assignedBy,
      url: `${process.env.APP_URL || ''}/tickets/${payload.ticketId}`,
    });
  }

  @OnEvent('ticket.status.updated')
  async handleTicketStatusUpdated(payload: {
    ticketId: string;
    ticketNumber: string;
    subject: string;
    oldStatus: string;
    newStatus: string;
    assignedToId: string;
    updatedBy: string;
  }) {
    await this.telegramService.sendEvent('ticket.status.updated', {
      ticketNumber: payload.ticketNumber,
      subject: payload.subject,
      oldStatus: payload.oldStatus,
      newStatus: payload.newStatus,
      updatedBy: payload.updatedBy,
      url: `${process.env.APP_URL || ''}/tickets/${payload.ticketId}`,
    });
  }
}
