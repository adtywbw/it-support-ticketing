-- CreateIndex
CREATE INDEX "users_role_isActive_idx" ON "users"("role", "isActive");

-- CreateIndex
CREATE INDEX "ticket_history_userId_idx" ON "ticket_history"("userId");
