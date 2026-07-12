CREATE TYPE "FaqInteractionType" AS ENUM (
  'RecommendationsShown',
  'ArticleOpened',
  'ProblemResolved',
  'TicketCreated'
);

ALTER TABLE "faqs"
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "faq_interactions" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT,
  "faqId" TEXT,
  "categoryId" TEXT,
  "eventType" "FaqInteractionType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "faq_interactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "faqs_categoryId_isActive_idx" ON "faqs"("categoryId", "isActive");
CREATE INDEX "faq_interactions_createdAt_idx" ON "faq_interactions"("createdAt");
CREATE INDEX "faq_interactions_sessionId_eventType_idx" ON "faq_interactions"("sessionId", "eventType");
CREATE INDEX "faq_interactions_faqId_createdAt_idx" ON "faq_interactions"("faqId", "createdAt");
CREATE INDEX "faq_interactions_categoryId_createdAt_idx" ON "faq_interactions"("categoryId", "createdAt");

ALTER TABLE "faqs"
  ADD CONSTRAINT "faqs_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "faq_interactions"
  ADD CONSTRAINT "faq_interactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "faq_interactions"
  ADD CONSTRAINT "faq_interactions_faqId_fkey"
  FOREIGN KEY ("faqId") REFERENCES "faqs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "faq_interactions"
  ADD CONSTRAINT "faq_interactions_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
