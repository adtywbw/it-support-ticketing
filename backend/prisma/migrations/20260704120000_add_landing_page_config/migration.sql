-- CreateTable
CREATE TABLE "landing_page_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'default',
    "contact" JSONB NOT NULL DEFAULT '{"email":"","phone":"","hours":"","location":""}',
    "faqs" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landing_page_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "landing_page_config_key_key" ON "landing_page_config"("key");