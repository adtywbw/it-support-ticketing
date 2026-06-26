-- PERF-01: Additional database indexes
CREATE INDEX IF NOT EXISTS "users_createdAt_idx" ON "users"("createdAt");

CREATE INDEX IF NOT EXISTS "tickets_categoryId_idx" ON "tickets"("categoryId");
CREATE INDEX IF NOT EXISTS "tickets_subCategoryId_idx" ON "tickets"("subCategoryId");
CREATE INDEX IF NOT EXISTS "tickets_slaStatus_idx" ON "tickets"("slaStatus");
CREATE INDEX IF NOT EXISTS "tickets_updatedAt_idx" ON "tickets"("updatedAt");
CREATE INDEX IF NOT EXISTS "tickets_requesterId_createdAt_idx" ON "tickets"("requesterId", "createdAt");
CREATE INDEX IF NOT EXISTS "tickets_assignedToId_status_idx" ON "tickets"("assignedToId", "status");
CREATE INDEX IF NOT EXISTS "tickets_status_slaStatus_idx" ON "tickets"("status", "slaStatus");

CREATE INDEX IF NOT EXISTS "comments_ticketId_createdAt_idx" ON "comments"("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "comments_userId_idx" ON "comments"("userId");

CREATE INDEX IF NOT EXISTS "attachments_ticketId_visibility_idx" ON "attachments"("ticketId", "visibility");
CREATE INDEX IF NOT EXISTS "attachments_userId_idx" ON "attachments"("userId");

CREATE INDEX IF NOT EXISTS "ticket_history_ticketId_createdAt_idx" ON "ticket_history"("ticketId", "createdAt");

CREATE INDEX IF NOT EXISTS "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");

-- PERF-02: pg_trgm extension and GIN indexes for ILIKE search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS tickets_subject_trgm_idx ON tickets USING gin ("subject" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tickets_description_trgm_idx ON tickets USING gin ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tickets_ticket_number_trgm_idx ON tickets USING gin ("ticketNumber" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS users_name_trgm_idx ON users USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS users_email_trgm_idx ON users USING gin (email gin_trgm_ops);

-- PERF-05: Ticket number sequence
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq MINVALUE 0;

SELECT setval(
  'ticket_number_seq',
  COALESCE((
    SELECT MAX(CAST(SUBSTRING("ticketNumber" FROM 5) AS INTEGER))
    FROM tickets
    WHERE "ticketNumber" ~ '^TKT-[0-9]+$'
  ), 0),
  true
);

-- Partial index for dashboard resolved tickets
CREATE INDEX IF NOT EXISTS tickets_resolved_category_partial_idx
  ON tickets ("categoryId")
  WHERE "resolvedAt" IS NOT NULL AND status IN ('Resolved', 'Closed');
