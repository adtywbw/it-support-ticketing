import { Role } from '@prisma/client';

export interface NotificationEventDef {
  event: string;
  label: string;
  roles: Role[];
}

export const NOTIFICATION_EVENTS: readonly NotificationEventDef[] = [
  {
    event: 'ticket.created',
    label: 'New Ticket Created',
    roles: [Role.EndUser, Role.ITSupport, Role.Admin],
  },
  {
    event: 'ticket.assigned',
    label: 'Ticket Assigned',
    roles: [Role.ITSupport, Role.Admin],
  },
  {
    event: 'ticket.status.updated',
    label: 'Ticket Status Updated',
    roles: [Role.EndUser, Role.ITSupport, Role.Admin],
  },
];

export function getEventsForRole(role: Role): { event: string; label: string }[] {
  return NOTIFICATION_EVENTS.filter((e) => e.roles.includes(role)).map((e) => ({
    event: e.event,
    label: e.label,
  }));
}

export function isEventEnabled(prefs: unknown, event: string): boolean {
  if (prefs === null || typeof prefs !== 'object' || Array.isArray(prefs)) {
    return true;
  }
  return (prefs as Record<string, unknown>)[event] !== false;
}

export function normalizePreferences(
  prefs: unknown,
  role: Role,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const { event } of getEventsForRole(role)) {
    result[event] = isEventEnabled(prefs, event);
  }
  return result;
}
