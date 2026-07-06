-- Change FK constraints from ON DELETE RESTRICT to ON DELETE CASCADE
-- so that deleting a ticket cascade-deletes its comments, attachments,
-- and ticket_history entries instead of failing with FK violation.

ALTER TABLE "comments" DROP CONSTRAINT "comments_ticketId_fkey",
ADD CONSTRAINT "comments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attachments" DROP CONSTRAINT "attachments_ticketId_fkey",
ADD CONSTRAINT "attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_history" DROP CONSTRAINT "ticket_history_ticketId_fkey",
ADD CONSTRAINT "ticket_history_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
