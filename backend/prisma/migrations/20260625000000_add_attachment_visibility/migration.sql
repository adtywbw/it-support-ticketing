-- CreateEnum
CREATE TYPE "AttachmentVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN "visibility" "AttachmentVisibility" NOT NULL DEFAULT 'PUBLIC';

-- Backfill: attachments linked to internal comments become INTERNAL
UPDATE "attachments" SET "visibility" = 'INTERNAL'
WHERE "commentId" IN (
  SELECT "id" FROM "comments" WHERE "type" = 'INTERNAL'
);
