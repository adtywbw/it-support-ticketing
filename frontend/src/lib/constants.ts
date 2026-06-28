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
