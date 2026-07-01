export const ALLOWED_MIME_TYPES: string[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-rar-compressed',
];

export const MAX_DIRECT_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const MAX_COMMENT_ATTACHMENT_SIZE = 5 * 1024 * 1024;
export const MAX_TICKET_ATTACHMENT_SIZE = 5 * 1024 * 1024;

// Poll intervals (ms)
export const UNREAD_NOTIFICATIONS_POLL_MS = 30_000;
export const MAINTENANCE_POLL_MS = 15_000;
export const STALE_TIME_CATEGORIES = 30 * 60 * 1000;
export const STALE_TIME_ASSIGNABLE_USERS = 10 * 60 * 1000;
export const STALE_TIME_TELEGRAM_CONFIG = 5 * 60 * 1000;
export const STALE_TIME_NOTIFICATION_DROPDOWN = 30_000;
export const STALE_TIME_TICKETS = 30_000;
export const STALE_TIME_DASHBOARD = 10_000;
