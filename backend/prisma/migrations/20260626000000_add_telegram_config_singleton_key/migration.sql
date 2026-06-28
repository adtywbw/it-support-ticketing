-- AlterTable
ALTER TABLE "telegram_config" ADD COLUMN "key" TEXT NOT NULL DEFAULT 'default';

-- Dedup: if multiple rows exist (from pre-singleton findOrCreate race), keep only the newest
DELETE FROM "telegram_config" a USING "telegram_config" b
WHERE a."createdAt" < b."createdAt";

-- CreateIndex
CREATE UNIQUE INDEX "telegram_config_key_key" ON "telegram_config"("key");
