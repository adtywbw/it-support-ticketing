-- AlterTable
ALTER TABLE "telegram_config" ADD COLUMN "key" TEXT NOT NULL DEFAULT 'default';

-- CreateIndex
CREATE UNIQUE INDEX "telegram_config_key_key" ON "telegram_config"("key");
