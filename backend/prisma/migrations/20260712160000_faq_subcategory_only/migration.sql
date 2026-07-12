-- INTENTIONAL DATA RESET: this migration deletes existing FAQ content and
-- FAQ interaction analytics because category associations cannot be mapped
-- deterministically to one sub-category. No ticket or other domain data is deleted.
DELETE FROM "faq_interactions";
DELETE FROM "faqs";

ALTER TABLE "faq_interactions" DROP CONSTRAINT "faq_interactions_categoryId_fkey";
ALTER TABLE "faqs" DROP CONSTRAINT "faqs_categoryId_fkey";
DROP INDEX "faq_interactions_categoryId_createdAt_idx";
DROP INDEX "faqs_categoryId_isActive_idx";

ALTER TABLE "faqs"
  DROP COLUMN "categoryId",
  ADD COLUMN "subCategoryId" TEXT NOT NULL,
  ADD COLUMN "showOnLogin" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "faq_interactions"
  DROP COLUMN "categoryId",
  ADD COLUMN "subCategoryId" TEXT NOT NULL;

CREATE INDEX "faqs_subCategoryId_isActive_idx"
  ON "faqs"("subCategoryId", "isActive");
CREATE INDEX "faq_interactions_subCategoryId_createdAt_idx"
  ON "faq_interactions"("subCategoryId", "createdAt");

ALTER TABLE "faqs"
  ADD CONSTRAINT "faqs_subCategoryId_fkey"
  FOREIGN KEY ("subCategoryId") REFERENCES "sub_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "faq_interactions"
  ADD CONSTRAINT "faq_interactions_subCategoryId_fkey"
  FOREIGN KEY ("subCategoryId") REFERENCES "sub_categories"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
