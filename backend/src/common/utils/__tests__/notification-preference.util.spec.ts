import { Role } from '@prisma/client';
import {
  NOTIFICATION_EVENTS,
  getEventsForRole,
  isEventEnabled,
  normalizePreferences,
} from '../notification-preference.util';

describe('notification-preference util', () => {
  describe('NOTIFICATION_EVENTS', () => {
    it('defines the canonical events', () => {
      const events = NOTIFICATION_EVENTS.map((e) => e.event);
      expect(events).toEqual([
        'ticket.created',
        'ticket.assigned',
        'ticket.status.updated',
        'ticket.priority.updated',
      ]);
    });
  });

  describe('getEventsForRole', () => {
    it('excludes ticket.assigned for EndUser', () => {
      const events = getEventsForRole(Role.EndUser).map((e) => e.event);
      expect(events).toEqual(['ticket.created', 'ticket.status.updated', 'ticket.priority.updated']);
    });

    it('includes all events for ITSupport', () => {
      const events = getEventsForRole(Role.ITSupport).map((e) => e.event);
      expect(events).toEqual([
        'ticket.created',
        'ticket.assigned',
        'ticket.status.updated',
        'ticket.priority.updated',
      ]);
    });

    it('includes all events for Admin', () => {
      const events = getEventsForRole(Role.Admin).map((e) => e.event);
      expect(events.length).toBe(4);
    });
  });

  describe('isEventEnabled', () => {
    it('returns true for null prefs (default on)', () => {
      expect(isEventEnabled(null, 'ticket.created')).toBe(true);
    });

    it('returns true for undefined prefs', () => {
      expect(isEventEnabled(undefined, 'ticket.created')).toBe(true);
    });

    it('returns true for non-object prefs (string)', () => {
      expect(isEventEnabled('nope', 'ticket.created')).toBe(true);
    });

    it('returns true for an array', () => {
      expect(isEventEnabled([], 'ticket.created')).toBe(true);
    });

    it('returns true when the key is absent', () => {
      expect(isEventEnabled({}, 'ticket.created')).toBe(true);
    });

    it('returns true when the key is explicitly true', () => {
      expect(isEventEnabled({ 'ticket.created': true }, 'ticket.created')).toBe(true);
    });

    it('returns false only when the key is explicitly false', () => {
      expect(isEventEnabled({ 'ticket.created': false }, 'ticket.created')).toBe(false);
    });

    it('ignores unrelated keys', () => {
      expect(isEventEnabled({ 'ticket.assigned': false }, 'ticket.created')).toBe(true);
    });
  });

  describe('normalizePreferences', () => {
    it('fills all role-relevant keys with defaults for null prefs', () => {
      expect(normalizePreferences(null, Role.ITSupport)).toEqual({
        'ticket.created': true,
        'ticket.assigned': true,
        'ticket.status.updated': true,
        'ticket.priority.updated': true,
      });
    });

    it('preserves explicit false and defaults the rest', () => {
      expect(
        normalizePreferences({ 'ticket.created': false }, Role.ITSupport),
      ).toEqual({
        'ticket.created': false,
        'ticket.assigned': true,
        'ticket.status.updated': true,
        'ticket.priority.updated': true,
      });
    });

    it('drops keys not relevant to the role', () => {
      // EndUser prefs accidentally contain ticket.assigned (e.g. former role)
      const result = normalizePreferences(
        { 'ticket.assigned': false, 'ticket.created': false },
        Role.EndUser,
      );
      expect(result).toEqual({
        'ticket.created': false,
        'ticket.status.updated': true,
        'ticket.priority.updated': true,
      });
      expect(result).not.toHaveProperty('ticket.assigned');
    });
  });
});
