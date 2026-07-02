# Changelog

Riwayat perubahan project yang dipindahkan dari `AGENTS.md` agar project memory tetap ringkas.

## Session 18 — Admin SLA Configuration

### Feature
- Admin can manage SLA configs via a new **SLA Configuration** tab in Admin - Master Data.
- Table list UI: each row shows category name, priority (color-coded), response time, resolution time (human-readable), status badge (active/inactive), and Edit/Activate/Deactivate actions.
- Create modal: active categories only, priority selector (Low/Medium/High/Critical), response/resolution time with value + unit (minutes/hours/days).
- Edit modal: pre-fills existing values, editable time fields, read-only category/priority info.
- Activate/deactivate via ConfirmDialog — no permanent delete.
- Frontend validates: category required, valid numbers, resolution >= response, duplicate category+priority check.

### Backend Behavior Change
- **Auto-recalculation**: `SLAService.create()` and `SLAService.update()` now automatically recalculate `slaDueAt` and `slaStatus` for affected non-terminal tickets when SLA timing (`responseTimeMinutes`/`resolutionTimeMinutes`) is created or changed.
- Recalculation uses keyset pagination (batch 500) with consistent `now` timestamp across all batches.
- `isActive`-only updates do NOT trigger recalculation.
- Recalculation skips `Resolved`/`Closed` tickets.

### Files Changed (backend)
- `backend/src/sla/sla.service.ts` — added `calculateSlaStatus()`, `recalculateOpenTicketsForConfig()`; updated `create()` and `update()` to trigger recalculation.
- `backend/src/sla/sla.service.spec.ts` — added 5 tests for recalculation, 2 augmented existing tests.

### Files Changed (frontend)
- `frontend/src/types/index.ts` — added `SLAConfig`, `CreateSLAConfigPayload`, `UpdateSLAConfigPayload`.
- `frontend/src/lib/constants.ts` — added `STALE_TIME_SLA_CONFIGS`.
- `frontend/src/lib/sla-time.ts` — **new** — `toMinutes`, `splitMinutesForInput`, `formatSLADuration`, `isValidSLAWindow`.
- `frontend/src/lib/__tests__/sla-time.test.ts` — **new** — 4 unit tests.
- `frontend/src/hooks/use-sla-configs.ts` — **new** — `useSLAConfigs`, `useCreateSLAConfig`, `useUpdateSLAConfig`.
- `frontend/src/hooks/__tests__/use-sla-configs.test.tsx` — **new** — 3 hook tests.
- `frontend/src/components/admin/SLAConfigManager.tsx` — **new** — full SLA config management component.
- `frontend/src/components/admin/__tests__/SLAConfigManager.test.tsx` — **new** — 2 component tests.
- `frontend/src/components/admin/MasterDataManagement.tsx` — added SLA Configuration tab.

### Verification
- Backend: 25/25 SLA service tests pass, full suite 253/253 pass.
- Frontend: 9/9 focused tests (sla-time + use-sla-configs + SLAConfigManager) pass, full suite 34/34 pass.
- Frontend build: ✅, lint: ✅, backend build: ✅.

## Session 17 — CI Pipeline Fixes & NestJS 11 Upgrade Completion

CI pipeline gagal terus di kedua job (backend + frontend). Root cause dan fix:

### Backend
- **CI-01**: `npm ci` gagal — `@nestjs/common` masih v10 sementara `@nestjs/core` sudah v11, peer dependency conflict. Fix: upgrade `@nestjs/common` ke v11.1.27.
- **CI-02**: `npm ci` gagal — `@nestjs/jwt@10` dan `@nestjs/passport@10` peer deps hanya support NestJS 8–10, belum v11. Fix: upgrade `@nestjs/jwt` ke v11.0.2 dan `@nestjs/passport` ke v11.0.5.
- **CI-03**: `npm run build` gagal setelah upgrade `@nestjs/jwt@11` — `expiresIn` type lebih strict (butuh `StringValue` dari `ms`, bukan plain `string`). Fix: cast `expiresIn` ke `StringValue` di `auth.module.ts` dan `auth.service.ts`.
- **CI-04**: `npm test` 2 suite failed (`auth.service.spec.ts`, `auth.controller.spec.ts`) — `uuid@14` ESM-only, Jest CommonJS tidak bisa parse `export` syntax. Fix: tambah `transformIgnorePatterns: ["node_modules/(?!uuid)"]` di Jest config (`package.json`).

### Frontend
- **CI-05**: `npm audit --audit-level=high` gagal — 6 high severity vulnerabilities di `minimatch` (ReDoS), dependency dari `@typescript-eslint/*` v6. Fix: upgrade `@typescript-eslint/eslint-plugin` dan `@typescript-eslint/parser` ke v7.18.0, `eslint` ke v8.57.0. `npm audit --audit-level=high` sekarang 0 vulnerabilities.

### CI Workflow
- **CI-06**: GitHub Actions `actions/checkout@v4` dan `actions/setup-node@v4` target Node.js 20 (deprecated, dipaksa jalan di Node.js 24). Fix: upgrade kedua actions ke v5.

### Residual Items Resolved
- 13 moderate vulnerabilities yang ditangguhkan di Session 6 (Residual/deferred) dan CRT-01 — NestJS 11 upgrade sekarang selesai, `npm audit --audit-level=high` 0 vulnerabilities untuk backend dan frontend.
- `multer` high vulnerability yang disebut di Session 4 (Security Review Fixes) — sudah resolved dengan NestJS 11 upgrade + multer v2 override sebelumnya.

### Verification
- Backend: `npm ci` ✅, `npm run build` ✅, `npm test` 248/248 pass ✅, `npm audit --audit-level=high` 0 vulns ✅
- Frontend: `npm ci` ✅, `npm run lint` ✅, `npm run build` ✅, `npm test` 25/25 pass ✅, `npm audit --audit-level=high` 0 vulns ✅

## Session 16 — Maintenance Restore Regression Fixes

- Restore DB backup yang berisi trigram indexes (`gin_trgm_ops`) sekarang menyisipkan `CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;` saat import. Root cause: backup dibuat dengan `pg_dump --schema public`, sehingga extension `pg_trgm` tidak ikut dump; setelah `DROP SCHEMA public CASCADE`, index trigram gagal dibuat karena operator class hilang.
- Restore success path sekarang melepas `maintenance:restore:lock` sebelum memanggil `setMaintenanceMode(false)`. Sebelumnya disable maintenance ditolak oleh guard service sendiri (`Cannot disable maintenance during active restore`), membuat restore yang sudah selesai tetap dilaporkan gagal dan maintenance tertahan.
- Regression tests ditambahkan di `maintenance.service.spec.ts` untuk urutan release-lock-before-disable dan pg_trgm restore SQL rewrite.
- Verification: backend `maintenance.service.spec.ts` 5/5 pass; full backend tests 248/248 pass; API image rebuilt and service healthy.

## Session 15 — Frontend Test Infrastructure

- Vitest dipasang sebagai test runner; `vite.config.ts` update dengan test config; `src/test/setup.ts` buat `@testing-library/jest-dom`.
- `ProtectedRoute.test.tsx`: 3 tests — refresh envelope, unauthenticated redirect, auth display.
- `auth-store.test.tsx`: 3 tests — login, logout, token persistence.
- `Pagination.test.tsx`: 5 tests — page info, no "All" option, Next click, Previous disabled, Next disabled.
- `use-notifications.test.tsx`: 2 tests — unread count fetch, notifications list fetch.
- Total: 13 frontend tests, semua pass.

## Session 14 — Review Fixes Batch 2 (review-fixes-batch-2 branch)

9 task hasil project review July 2026. Backend: 246/246 tests, frontend: 25/25 tests, all builds/lint pass.

### Security Hardening
- **Task 1**: JWT verification pinned ke `HS256` di semua path — `AuthService.refresh()`, `revokeRefreshToken()`, `NotificationsGateway.handleConnection()`, dan `NotificationsModule`. Sebelumnya hanya di `JwtStrategy` dan `MaintenanceGuard`.
- **Task 7**: `validateStartupEnv()` diekstrak ke `env-validation.util.ts`. Production sekarang reject `CORS_ORIGIN` yang bukan `https://` (selain dev mode).

### Behavior Consistency
- **Task 3**: `updatePriority()` sekarang reuse `SLAService.getSLAConfig()` untuk SLA fallback — konsisten dengan `create()` yang sudah pakai sejak Sesi 9. Sebelumnya fallback hardcoded 24 jam di priority update.
- **Task 4**: CSV export `GET /api/tickets/export/csv` sekarang honor `sortBy`/`sortOrder` (sama seperti list view), dengan `id` sebagai deterministic secondary sort. Sebelumnya selalu sort by `id`.

### Test Coverage
- **Task 2**: Ticket repository access scope test yang sebelumnya `it.skip` diganti 4 test aktif (`buildTicketAccessWhere`, `findManyForUser`, `countForUser`). Tidak ada `it.skip` tersisa di backend specs.

### Frontend Fixes
- **Task 5**: `useCategories()` dan `useCategory()` query key sekarang include `role` — caches tidak tercampur antar role (Admin vs EndUser response shape berbeda).
- **Task 6**: `NotificationsPage` sekarang tampilkan error state (`ErrorMessage` + retry) saat query gagal, bukan "No notifications". Pagination pakai `meta.totalPages` dari backend, bukan recompute lokal.
- `.eslintignore` ditambahkan dengan `dist` — `npm run lint` sebelumnya gagal setelah `npm run build` karena memindai output bundle.

### Ops
- **Task 8**: `scripts/backup.sh` sekarang cek `maintenance:restore:lock` (refuse jika restore aktif) dan akuisisi `maintenance:backup:lock` via `SET NX EX 600` dengan Lua compare-and-delete release + `trap EXIT`. Sebelumnya hanya cek `maintenance:enabled`.

### Repo Health
- **Task 9**: `backend/package.json` — hapus script `test:e2e` (config tidak pernah ada). CI — hapus `--passWithNoTests` dari test commands. README seed description diperbaiki. ARCHITECTURE Alpine wording diperbaiki.

## Session 13 — Minor Fixes: Dead Code, Validation, Consistency

Continuing from Sesi 12. Cleanup dead code, add missing validation, consistent staleTime.

### Dead Code Removal
- `skip-maintenance.decorator.ts` — DELETED. `@SkipMaintenance()` was never applied to any controller (superseded by `@Public()` since Session 4). Removed the decorator, `SKIP_MAINTENANCE_KEY` import + reflector check from `maintenance.guard.ts`, and the `Reflector` dependency from the guard constructor + `app.module.ts`. Updated `maintenance.guard.spec.ts` to remove the `@SkipMaintenance()` test case. Removed AGENTS.md reference. Guard is now simpler (no reflector needed).

### Validation
- `prisma/seed.ts` — restructure password handling to eliminate non-null assertions (`!`). Production env vars validated and narrowed within dedicated `if (isProduction)` block; dev defaults handled in `else` branch. TypeScript narrows cleanly without `!` or `as string`.

### Frontend Consistency
- New staleTime constants in `lib/constants.ts`: `STALE_TIME_TICKETS` (30s), `STALE_TIME_DASHBOARD` (10s).
- `use-categories.ts` — `useCategory(id)` now uses `STALE_TIME_CATEGORIES` (same as `useCategories()` list).
- `use-users.ts` — `useUsers()` now uses `STALE_TIME_ASSIGNABLE_USERS` (same as `useAssignableUsers()`).
- `use-telegram.ts` — `useTelegramStatus()` now uses `STALE_TIME_TELEGRAM_CONFIG` (same as `useTelegramConfig()`).
- `use-tickets.ts` — `useTickets()` now uses `STALE_TIME_TICKETS` (30s, operational data).
- `use-dashboard.ts` — `useDashboardStats()` now uses `STALE_TIME_DASHBOARD` (10s, server-side cached).

### Notes
- No production behavior changes — dead code removal + validation + frontend cache consistency.
- Backend: 237 tests pass (1 skipped), build clean.
- Frontend: build clean, lint 0 issues.

## Session 12 — More Polish & Dead Code Removal

Continuing from Sesi 11 Minor fixes. Cleanup dead code, tighten validation, type safety, and code quality.

### Code Quality
- `auth/cookie-options.ts` — NEW shared module extracting `getCookieSecure`, `getRefreshCookieMaxAge`, `getRefreshCookieOptions`, and `REFRESH_COOKIE` constant. Replaces inline helpers in `auth.controller.ts`.
- `local-storage.service.ts` — remove dead `=== uploadRoot` branch (callers always pass a file path, not a directory). Switch from `* as fs from 'fs'` + `* as fsSync from 'fs'` to named imports (`createReadStream` from `fs`, `mkdir`/`writeFile`/`unlink` from `fs/promises`).
- `dashboard.service.ts` + `ticket.repository.ts` — `getDailyTrends(days)` → `getDailyTrends(from: Date, to: Date)`. Service computes the explicit `[from, to)` range and passes it down; repository no longer duplicates the `since` calculation. Adds `to` upper bound to the SQL query for consistency.

### Validation Tightening
- `maintenance/dto/maintenance-mode.dto.ts` — add `@IsNotEmpty()` to `message` field. Empty string now rejected at validation layer (in addition to service-level guard added in Sesi 11).

### Type Safety
- `notifications.service.ts` — `data.data as any` → `Prisma.InputJsonValue` for the JSON `data` column.
- `user.repository.ts` — extract `USER_SAFE_SELECT` and `USER_SAFE_SELECT_WITH_PASSWORD` constants. Used by `findById`, `findByIdWithPassword`, `findByEmail`, `findAll`, and `update` (5 methods). Single source of truth for safe user fields.

### Behavior Tightening
- `telegram.service.ts` — `updateConfig()` only restarts polling on `botToken` / `enableGroupChat` / `groupChatId` changes. Template-only edits no longer trigger a restart (avoids brief stale-loop gap).
- `notifications.gateway.ts` — `WS_CORS_ORIGIN` const → `getCorsOrigin()` function. Env now read at decoration time, not module-load.

### Test Updates (signature changes)
- `dashboard.service.spec.ts` — remove stale `forceRefresh=true` test case (parameter removed in Sesi 11). Update `getDailyTrends` mock to assert `[from, to)` Date range.
- `ticket.repository.spec.ts` — update `getDailyTrends` mock call to pass `new Date(), new Date()`.

### Notes
- No production behavior changes — only code quality and test signature updates.
- Backend: 237 tests pass (1 skipped placeholder), build clean.
- Frontend: not touched in Sesi 12.

## Session 11 — Polish & Minor Fixes

Code review polish round: extract shared utils, remove dead code, tighten validation, type safety.

### Shared Utils (reduce code duplication)
- `backend/src/common/utils/time.util.ts` — `parseExpiryToMs()` shared duration parser. Eliminates duplicate in `auth.service.ts` and `auth.controller.ts`.
- `backend/src/common/utils/concurrency.util.ts` — `runWithConcurrency()` shared async concurrency limiter. Eliminates duplicate in `notifications.service.ts` and refactors `telegram.service.ts` hand-rolled worker pool.
- `frontend/src/lib/utils.ts` — add `safeRedirectPath()` helper. Eliminates duplicate `startsWith('/') && !startsWith('//')` guard in `use-auth.ts` and `LoginPage.tsx`.

### Dead Code Removal
- `dashboard.service.ts` — remove unused `forceRefresh` parameter from `getStats()`. Controller never passes it.
- `maintenance.service.ts:260` — remove redundant `releaseLock(lock)` in `restoreBackup()` success path. `finally` block at line 274 already releases.

### Validation & Empty-Case Tightening
- `maintenance/dto/maintenance-mode.dto.ts` — add `@MaxLength(1000)` to `message` field.
- `maintenance.service.ts:82` — treat empty string `message` as "use default" (previously `message !== undefined` only checked `undefined`, not `''`).
- `redis.service.ts:12-13` — replace fragile `url.replace('redis://', ...)` with `new URL(url).password = ...`. Supports `rediss://`, paths, query strings.

### Type Safety
- `user.repository.ts` — replace `role: { in: ['ITSupport', 'Admin'] } as any` with typed `[Role.ITSupport, Role.Admin]` in 3 methods (`findSupportUsers`, `findAssignable`, `findTelegramLinkedUsers`).
- `telegram-config.repository.ts` — `update(data)` now uses `where: { key: DEFAULT_KEY }` instead of `where: { id }`. Caller changed from `config.id` to bare `update`.

### Frontend Constants Extraction
- `lib/constants.ts` — add named constants for poll intervals and stale times: `UNREAD_NOTIFICATIONS_POLL_MS`, `MAINTENANCE_POLL_MS`, `STALE_TIME_CATEGORIES`, `STALE_TIME_ASSIGNABLE_USERS`, `STALE_TIME_TELEGRAM_CONFIG`, `STALE_TIME_NOTIFICATION_DROPDOWN`.
- 6 hooks/layout files updated to import from `constants.ts` instead of inline magic numbers.

### Notes
- No production behavior changes — all changes are code-quality, not logic changes.
- Backend: 126 tests, build clean.
- Frontend: build clean, lint 0 issues.

## Session 10 — Test Coverage (sesi10/test-coverage branch)

Session 8 review menemukan 8/9 repository tanpa unit test. Sesi 10 add comprehensive coverage untuk semua repository dan service yang sebelumnya tidak ter-test.

### Repository Unit Tests (8 files, 99 new cases)
- `user.repository.spec.ts` (13): findById / findByIdWithPassword / findByEmail (safe select tanpa `password`), findAll (filter, search, pagination), getForValidation, findAssignable, findSupportUsers, existsByEmail (reactivation check), findTelegramLinkedUsers, findWithTelegramCode, getTelegramChatId, transactionDelete (4-step atomic).
- `notification.repository.spec.ts` (12): create, findByUserId (pagination, unreadOnly filter, envelope shape), markAsRead (id+userId scoping), markAllAsRead, clearAll, getUnreadCount, deleteMany.
- `ticket.repository.spec.ts` (10 + 1 skipped): raw queries (countPublicCommentsByTicketIds, countVisibleAttachmentsByTicketIds, getSLAStats, getDailyTrends, getAvgResolutionTimeByCategory), updateMany, transaction. `findManyForUser` test skipped — method added in Sesi 9.
- `comment.repository.spec.ts` (9): create, findById, findByTicketId (default + where merge + pagination), countByTicketId, deleteMany, transaction. `findByTicketId` 4-arg overload skipped (Sesi 9).
- `attachment.repository.spec.ts` (10): create, findByTicketId (default + custom where + skip/take + select-preferred-over-include), findById, count, deleteMany, transaction.
- `sla-config.repository.spec.ts` (5): findUnique composite-key, findFirst priority-fallback, findAll (with category include + ordering), create, update.
- `category.repository.spec.ts` (10): findAll (Admin full), findAllForTicketForm (EndUser/ITSupport minimal select vs include), findByIdForTicketForm (findFirst not findUnique), findById default vs custom include, findByName, create, update, delete.
- `sub-category.repository.spec.ts` (5): findByCategoryId, findByCategoryAndName composite unique, create, findById, update, delete.

### Service Tests (2 new files, 20 cases)
- `dashboard.service.spec.ts` (+10): getStats() cache hit / miss / forceRefresh, statusCounts initialization, SLA compliance rate (100% when total=0, ratio otherwise), daily trends (7d + 30d parallel), category resolution BigInt→Number coercion.
- `categories.service.spec.ts` (17): findAll/findById role-based shape (Admin full vs ITSupport/EndUser minimal), create (unique + conflict + intentional resurrection of inactive duplicate), update (self-exclusion), delete (hard vs soft when relations exist).

### SLA Cron Tests (+11 cases, in sla.service.spec.ts)
- SET NX EX 300 lock acquisition
- skip when lock already held (concurrent run)
- compare-and-delete Lua release in finally block
- lock release even on performSLACheck throw
- keyset pagination (id > lastId) for batch 500
- status transitions: OnTrack (60% remaining), AtRisk (10%), Breached (past)
- skip if no matching SLA config
- skip updateMany if status unchanged
- only query open/in-progress tickets

### Notes
- Total tests: 126 → 238 (+112)
- Test suites: 13 → 21 (+8)
- 2 tests skipped (Sesi 9 method signatures — will be re-enabled after Sesi 9 merge)
- All commits pass `npm test` and `npm run build`

## Session 9 — Apply Quick-Win Fixes (sesi9/quick-wins branch)

Baseline review menemukan 21 Important + 50 Minor issues. Sesi 9 apply 17 quick-win fixes (1 commit per logical change):

### Backend Infrastructure
- **INFRA-I-1**: `user.repository.ts:79` & `notification.repository.ts:30` — `totalPages = Math.ceil(total / limit) || 1` agar empty page tidak return `totalPages: 0`. Konsisten dengan `attachments.service.ts:144`.
- **INFRA-I-2**: `skip-maintenance.decorator.ts` — export `SKIP_MAINTENANCE_KEY` constant; `maintenance.guard.ts` import. Hindari string-literal typo.
- **INFRA-I-3**: `storage-service.interface.ts` — tambah `STORAGE_SERVICE` Symbol. 3 service + module + 1 test ganti `@Inject('StorageService')` → `@Inject(STORAGE_SERVICE)`.
- **INFRA-I-6**: `prisma.service.ts` — validate `DATABASE_URL` (empty/invalid) di constructor dengan error message eksplisit.

### Backend Security
- **SEC-I-1**: `maintenance.guard.ts:73` — `verifyAsync` dengan explicit `{ secret, algorithms: ['HS256'] }`. Hindari algorithm-downgrade jika `JwtModule` options berubah.
- **SEC-I-2**: `ticket.repository.ts` — `findManyForUser` + `countForUser` + `TicketAccessScope` + `buildTicketAccessWhere` helper. EndUser scope tidak bisa dilupakan caller baru.
- **SEC-I-3**: `comment.repository.ts:17-46` + `comments.service.ts:172-209` — visibility filter EndUser di-push ke Prisma `attachments.where` (bukan in-memory setelah fetch).
- **SEC-I-4**: `upload-attachment.dto.ts` (new) — `@IsEnum(AttachmentVisibility)`. `attachments.service.ts:43` parameter typed `AttachmentVisibility` bukan `string`.
- **SEC-I-5**: `comments.service.ts:102-109` — `MAX_FILES_PER_TICKET` count di dalam transaction (`tx.attachment.count`). Hindari race condition 2 concurrent comment-with-files.
- **SEC-I-6**: `auth.service.ts:151-156` — hapus direct `revokeAllRefreshTokens` di `changePassword`. Event handler (`@OnEvent('user.password_changed')`) yang handle, sync dispatch.

### Backend Business
- **BIZ-I-1**: `tickets.service.ts:45-77` — pakai `SLAService.getSLAConfig()` (priority-fallback ke lowest-resolutionTime). Konsisten dengan service SLA, bukan hardcoded 24h. `tickets.module.ts` import `SLAModule`.
- **BIZ-I-2**: `maintenance.service.ts:105-119` — `createBackup` reject jika `RESTORE_LOCK_KEY` set (kecuali `source='pre-restore'`). Hindari `pg_dump` terhadap schema yang sedang di-DROP.
- **BIZ-I-3**: `AGENTS.md` — tambah section "Category Field-Set by Role" lock contract EndUser+ITSupport minimal / Admin full. Code is correct per CHANGELOG P1-06.

### Frontend
- **FE-I-1**: `use-notifications.ts:40-52` — `useMarkAsRead.onSuccess` panggil `notificationStore.decrement()` untuk instant badge update.
- **FE-I-2**: `LoginPage.tsx` — render `location.state.message` di amber banner di atas form. Password change / restore success message tidak hilang.
- **FE-I-3**: `use-socket.ts:32-33,41-42` — `console.log` di guard dengan `import.meta.env.DEV`.
- **FE-I-4**: `use-change-password.test.tsx` (3 cases) + `use-socket.test.tsx` (5 cases). Test count: 13 → 21.

## Docker / TLS Refactor

- **DR-01**: Production TLS via compose override — added `nginx/nginx.ssl.conf` (HTTPS variant: port 80→301 redirect, 443 SSL, TLS 1.2/1.3) and `docker-compose.prod.yml` (override: port 443, certs mount, swap to SSL config). Eliminates manual editing of `nginx.conf`/`docker-compose.yml` for mkcert deployments. Dev: `docker compose up` (HTTP). Prod: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d` (HTTPS). Updated README, AGENTS.md, ARCHITECTURE.md, and `.env.compose.example` accordingly.
- **DR-02**: Password generation recommendation changed from `openssl rand -base64 24` to `openssl rand -hex 24` across README and `.env` example templates. Base64 output can contain `/`, `+`, `=` (reserved URI characters) which break `DATABASE_URL`/`REDIS_URL` parsing in Prisma and ioredis. Hex is URL-safe with the same 192-bit entropy.
- **DR-03**: nginx.ssl.conf security hardening — added `ssl_ciphers HIGH:!aNULL:!MD5`, `ssl_prefer_server_ciphers on`, `ssl_session_cache shared:SSL:10m`, `ssl_session_tickets off`, HSTS header (`max-age=31536000; includeSubDomains`), separate WebSocket rate limit zone (`ws_limit`, 5r/s), and tightened CSP on `/assets/` and `/index.html` (removed `ws: wss:` from `connect-src`). Lockfile regenerated with Node 20 npm for Docker `npm ci` compatibility.
- **Docker fix**: `npm ci` failure — regenerate lockfiles dengan Docker node version (npm 10) untuk kompatibilitas.

## Session 8 — Code Review Execution (2026-06-29)

Eksekusi `AI_AGENT_REVIEW_TASKS.md` — 10 task selesai, production readiness gate terpenuhi.

### Critical Bug Fixes (2026-06-28)
- **BUG-12**: API container stuck starting — PostgreSQL dalam `db` container hanya listen di `127.0.0.1`/`::1` karena `listen_addresses` tidak diset di `postgres/postgresql.conf`. Container `api` tidak bisa connect ke `db:5432` over Docker network. Fix: tambahkan `listen_addresses = '*'` di `postgres/postgresql.conf` agar PostgreSQL bind ke semua network interfaces termasuk Docker bridge.
- **BUG-13**: Telegram link code always rejected — `generateLinkCode()` produces 8-char codes (`substring(0, 8)`) tapi bot handler validasi `code.length !== 6`. Semua kode valid ditolak. Fix: ganti length check dari `!== 6` ke `!== 8` di `telegram.service.ts`.
- **BUG-14**: EndUser ticket list 500 Internal Server Error — `$queryRaw` tagged template di `ticket.repository.ts` menggunakan `${ticketIds}::uuid[]` cast yang gagal di Prisma 5 parameterized queries (error: `operator does not exist: text = uuid`). EndUser path memanggil `countPublicCommentsByTicketIds` dan `countVisibleAttachmentsByTicketIds` yang menggunakan raw query ini. Admin/ITSupport tidak terpengaruh karena tidak memanggil kedua method ini. Fix: hapus `::uuid[]` cast — PostgreSQL handle type coercion secara implisit.
- **BUG-15**: auth/refresh 500 during backup restore — `refresh()` di `auth.service.ts` tidak wrap Redis `eval()` dan `usersService.findById()` dalam try/catch. Saat restore menjalankan `DROP SCHEMA CASCADE`, tabel User tidak ada → Prisma throw error non-HttpException → HttpExceptionFilter return 500. Redis unreachable juga produce 500. Fix: wrap kedua call dalam try/catch, return `UnauthorizedException` (401) sebagai gantinya.
- **BUG-16**: Admin tidak bisa navigate setelah login saat maintenance — Frontend axios interceptor hanya handle 401, tidak handle 503. Semua non-auth endpoint return 503 saat maintenance aktif, tapi frontend tidak redirect ke maintenance page. Admin terjebak di halaman error tanpa cara disable maintenance. Fix: tambahkan 503 handler di axios interceptor yang redirect ke `/admin/maintenance`.
- **BUG-17**: Redis `stop-writes-on-bgsave-error` blocking login — Redis container tanpa persistence volume gagal RDB save → `stop-writes-on-bgsave-error yes` (default) mem-block semua write termasuk login account lock check → 500. Fix: tambahkan `stop-writes-on-bgsave-error no` ke Redis config di `docker-compose.yml`.

### High
- **CRT-01**: Backend dependency vulnerabilities — upgrade `multer` dari `^1.4.5-lts.1` ke `^2.2.0` + override di `package.json` (fix nested multer di `@nestjs/platform-express`). Hapus unused `diskStorage` import di `attachments.controller.ts`. `npm audit --omit=dev --audit-level=high` sekarang 0 high (sebelumnya 2 high). Lockfile di-regenerate dengan Docker node 20. 13 moderate tersisa butuh NestJS 11 upgrade (breaking, ditangguhkan).
- **CRT-02**: Frontend tests diperbaiki — `ProtectedRoute.test.tsx` ganti `vi.mock('axios')` auto-mock ke manual mock yang setup `axios.create().interceptors.request/response.use()` (fix `TypeError: Cannot read properties of undefined (reading 'interceptors')`). `use-notifications.test.tsx` tambah `unwrapPage` ke mock + update expectation ke shape `{ data, meta }`. 4 suites / 13 tests pass (sebelumnya 2 suites failed).

### Medium
- **CRT-03**: SLA partial update validation — `SLAService.update()` sekarang load existing config by ID, merge `responseTimeMinutes`/`resolutionTimeMinutes` dengan patch values, lalu validate merged values via `assertSlaWindow()`. Throw `NotFoundException` jika config tidak ada. Sebelumnya hanya validate saat kedua field disediakan, sehingga partial update bisa melanggar invariant `resolution >= response`. 9 unit test ditambah.
- **CRT-04**: Office file MIME validation — tambah `MIME_COMPATIBILITY_MAP` di `mime-validation.util.ts`: `application/zip` compatible dengan OOXML MIME (`.docx`/`.xlsx`), `application/msword` (OLE CFB signature) compatible dengan `application/vnd.ms-excel` (`.xls`). `assertMimeTypeIntegrity()` cek compatibility map sebelum reject. Spoofing obvious (ZIP declared as PNG) tetap ditolak. 18 unit test ditambah.
- **CRT-05**: WebSocket session token expiry — `NotificationsGateway` sekarang baca `payload.exp` setelah JWT verify: jika sudah expired → disconnect langsung, jika belum → schedule `setTimeout` disconnect di expiry. Timer di-clear pada disconnect dan user deactivation. Frontend `useSocket()` sudah reconnect saat `accessToken` berubah (refresh), jadi tidak butuh perubahan frontend. 12 unit test ditambah (fake timers).
- **CRT-06**: DTO blank text validation — `CreateTicketDto` tambah `@Transform(trimString)` + `@IsNotEmpty()` + `@MinLength(5)` untuk subject, `@MinLength(10)` untuk description (match frontend). `CreateCommentDto` tambah `@Transform(trimString)` + `@IsNotEmpty()` untuk content. Direct API client tidak lagi bisa kirim whitespace-only payload. 14 unit test ditambah.
- **CRT-07**: TelegramConfig singleton atomic — repository ganti `findFirst()` ke `findUnique({ where: { key: 'default' } })` dan `findOrCreate()` ke `upsert()` on key (race-free). `create()` selalu set `key: 'default'`. Sebelumnya `findFirst()` + `create()` bisa race under concurrent startup. 7 unit test ditambah (termasuk concurrent findOrCreate).
- **CRT-08**: Failed attachment upload visibility — `CreateTicketForm.tsx` ganti `setUploadError()` ke `toast.error()` untuk kasus upload gagal setelah ticket dibuat. Sebelumnya error disimpan ke state lokal lalu component langsung navigate, sehingga error hilang saat unmount. Toast tetap visible di ticket detail page.
- **CRT-09**: Compose env local vs production — `.env.compose.example` default diubah ke `NODE_ENV=development` + `COOKIE_SECURE=false` (match nginx HTTP-only bundled). Header comment dokumentasi production HTTPS reverse proxy config (NODE_ENV=production, COOKIE_SECURE=true, CORS_ORIGIN HTTPS). README Quick Start diupdate dengan catatan local HTTP vs production HTTPS.
- **CRT-10**: Dashboard cache invalidation wired — `DashboardService` tambah `@OnEvent` listener untuk `ticket.created`, `ticket.status.updated`, `ticket.assigned`, `ticket.priority.updated`, `ticket.deleted` → `invalidateCache()` dengan error handling. `TicketsService.updatePriority()` emit `ticket.priority.updated`, `delete()` emit `ticket.deleted` (3 event lain sudah ada). Sebelumnya `invalidateCache()` ada tapi tidak pernah dipanggil, dashboard stats stale sampai Redis TTL 30s expire. 3 unit test ditambah.

### Test Suite Growth
- Backend: 6 → 13 suites, 63 → 126 tests.
- Frontend: 2 failed → 4 suites / 13 tests pass.
- New spec files: `sla.service.spec.ts`, `mime-validation.util.spec.ts`, `notifications.gateway.spec.ts`, `create-ticket.dto.spec.ts`, `create-comment.dto.spec.ts`, `telegram-config.repository.spec.ts`, `dashboard.service.spec.ts`.

### Production Readiness Gate
1. Backend production audit: 0 high-severity ✅
2. Frontend tests pass ✅
3. SLA partial update validation fixed ✅
4. Upload MIME validation matches allowed types ✅
5. Deployment docs/config distinguish HTTP local vs HTTPS production ✅

### Residual (deferred)
- 13 moderate vulnerabilities butuh NestJS 11 upgrade (breaking). `file-type` (ZIP bomb DoS) paling relevan karena app proses upload.
- E2E / integration tests belum ada.

## Session 7 — Performance Optimizations (2026-06-28)

### Critical
- **PERF-C1**: Redis `maxmemory 400mb` + `maxmemory-policy allkeys-lru` — mencegah OOM kill yang invalidates semua refresh tokens + cache. Config ditambah ke Redis `command` di `docker-compose.yml`.
- **PERF-C2**: PostgreSQL tuning via custom `postgres/postgresql.conf` — `shared_buffers=512MB`, `work_mem=16MB`, `effective_cache_size=1536MB`, `maintenance_work_mem=128MB`, `random_page_cost=1.1`, `effective_io_concurrency=200`. Mount sebagai `command: postgres -c config_file=...` di db service.

### High
- **PERF-H1**: Maintenance polling di-gate ke authenticated users saja — `MaintenanceBanner` tidak lagi poll `/api/maintenance/mode` setiap 5s untuk unauthenticated visitors. Interval dinaikkan dari 5s ke 15s. Reduksi ~72k req/jam per 100 concurrent users.
- **PERF-H2**: `SortHeader` hoisted dari inside `TicketList` render body ke module scope — eliminasi full header remount pada setiap parent re-render (sort toggle, mutation isPending, deleteConfirm).
- **PERF-H3**: PostgreSQL `shm_size: 1g` di db container — default 64MB membatasi sort/parallel query operations; dashboard aggregate queries bisa spill to disk.
- **PERF-H4**: `DATABASE_POOL_MAX=20` (dari default 10) di `.env.compose.example` + `.env.local.example` — mencegah pool exhaustion saat SLA cron + concurrent API traffic.
- **PERF-H5**: nginx `access_log` buffered (`buffer=16k flush=2m`) — reduksi per-request I/O syscalls dari 1-per-request ke batch writes setiap 2 menit atau 16KB.

### Review Fixes — Batch 2 (Session 7)

Code review paralel 5 agent (security, architecture, frontend, privacy, maintenance/infra) menemukan 1 issue **Important** + 18 issue **Minor**. Tidak ada issue **Critical**.

#### Important
- **REV-I1**: `DashboardService` sebelumnya inject `PrismaService` langsung untuk tiga `$queryRaw` (SLA stats, daily trends, avg resolution time) — langgar aturan `service -> repository` flow. Fix: pindahkan tiga query ke `TicketRepository.getSLAStats()`, `TicketRepository.getDailyTrends(days)`, `TicketRepository.getAvgResolutionTimeByCategory()`. Service sekarang pure consumer repository.

#### Security Hardening
- **REV-M1**: JWT signing/verification sebelumnya tidak pin `algorithms` — library default saat ini HS256, tapi bisa widen di masa depan (downgrade attack). Fix: tambah `algorithms: ['HS256']` di `JwtStrategy` dan `algorithm: 'HS256'` di `JwtModule.registerAsync.useFactory`.
- **REV-M3**: `RolesGuard` dan `Roles` decorator pakai string literal `'roles'` — typo silent-disable role checks. Fix: export `ROLES_KEY` constant dari `roles.decorator.ts`, import di guard.

#### Architecture Consistency
- **REV-M8**: `HealthController` sebelumnya inject `PrismaService` langsung untuk `SELECT 1`. Fix: tambah `PrismaService.healthCheck()` method dengan try/catch internal, controller jadi tidak bergantung detail Prisma.
- **REV-M10**: `tickets.service`, `user.repository`, `notification.repository` sebelumnya return `meta: { page, limit, total }` tanpa `totalPages` — inconsistent dengan `comments`/`attachments` (yang sudah include). Fix: tiga endpoint paginated sekarang selalu include `totalPages = Math.ceil(total / limit)`.
- **REV-M11**: `NotificationsController.getUnreadCount` manual wrap `{ data: { count } }` — duplicate dengan `TransformInterceptor`. Fix: return raw `{ count }` biarkan interceptor wrap.
- **REV-M12**: `UsersController` dan `NotificationsController` pakai local `new ValidationPipe({...})` yang kehilangan `forbidNonWhitelisted` (override global). Fix: hapus local pipe, andalkan global `ValidationPipe`.

#### DTO Validation Tightening
- **REV-M13**: `UpdateSubCategoryDto.name` sebelumnya hanya `@IsString() + @MaxLength(255)` — whitespace-only `name` lolos. Fix: tambah `@Transform(trimString)` + `@IsNotEmpty()` (match pattern `create-sub-category.dto.ts`).
- **REV-M14**: `RestoreBackupDto.confirmation` whitespace-only lolos (`@IsString + @IsNotEmpty` tidak trim). Fix: tambah `@Transform(trimString)`.

#### Telegram Contract
- **REV-M15**: `TelegramService.getConfig()` return `botToken: ''` (empty string field) — misleading type. Fix: drop field dari response. Frontend `TelegramConfig` interface di `use-telegram.ts` hapus `botToken: string`. Frontend `MyAccountPage` sebelumnya tidak pernah reference `telegramConfig.data?.botToken` — no migration needed.

#### Maintenance Flow
- **REV-M17**: `MaintenanceGuard.isAllowedDuringMaintenance` pakai `req.url` (termasuk query string) — exact match `/health` gagal untuk `/health?check=deep` (latent bug). Fix: pakai `req.path ?? req.url` (path-only, fallback aman untuk plain object test mocks).
- **REV-M18**: `MaintenanceService.getMaintenanceMode` pakai 2 sequential `redis.get()` — endpoint public yang di-poll frontend tiap 15s. Fix: pakai `redis.mget([KEY, MESSAGE])` seperti guard.

#### Frontend UX
- **REV-M19**: `LoginForm` tampilkan error 2x (inline `<div>` + `toast.error()` dari `useLogin`). Fix: hapus inline error block, biar toast dari `useLogin` saja (AGENTS.md prefer toast).

#### Test Updates
- `tickets.service.spec.ts` — update expected meta tambah `totalPages: 1` (match production behavior).
- `maintenance.guard.spec.ts` — tanpa perubahan kode test, fallback `req.path ?? req.url` di guard handle plain mock req.

#### Test Suite Status
- Backend: 13/13 suites, 126/126 tests pass.
- Frontend: build + lint pass (no test changes in this batch).

## Session 6 — Bug & Edge Case Fixes (2026-06-28)

### Critical
- **BUG-01**: `restoreBackup()` — `setMaintenanceMode(false)` dipanggil saat `RESTORE_LOCK` masih di-hold → throw → maintenance stuck meski restore berhasil. Fix: release lock sebelum disable maintenance (`maintenance.service.ts`).

### High
- **BUG-02**: Refresh token replay — `redis.get` + `redis.del` non-atomic → concurrent refresh with same token both succeed. Fix: atomic Lua GETDEL script (`auth.service.ts`).
- **BUG-03**: `NODE_ENV === 'production'` case-sensitive → `Production`/`PRODUCTION` bypass semua production security checks. Fix: `toLowerCase()` comparison (`main.ts`, `seed.ts`).
- **BUG-04**: `telegram_config` migration gagal jika >1 row exist (no dedup before unique index). Fix: hapus duplikat sebelum `CREATE UNIQUE INDEX` (`migration.sql`).
- **BUG-05**: Login lockout permanent — `incr` succeeds but `expire` fails → key tanpa TTL → user locked forever. Fix: atomic Lua INCR+EXPIRE script (`auth.service.ts`).
- **BUG-06**: `handleGenerateCode` `mutateAsync` tanpa try/catch → silent failure, no toast. Fix: wrap dalam try/catch + `toast.error` (`MyAccountPage.tsx`).
- **BUG-07**: `handleSaveConfig` `mutateAsync` tanpa try/catch → silent failure, no toast. Fix: wrap dalam try/catch + `toast.error` (`MyAccountPage.tsx`).
- **BUG-08**: Health endpoint return HTTP 200 meski `status: 'unhealthy'` → Docker healthcheck never detects DB outage. Fix: `res.status(503)` saat unhealthy (`health.controller.ts`).
- **BUG-09**: MaintenanceGuard `redis.mget` dipanggil SEBELUM `isAllowedDuringMaintenance` → Redis down = `/health`, `/auth`, `/maintenance` semua 500. Fix: cek allowed paths sebelum Redis; default allow saat Redis error (`maintenance.guard.ts`).
- **BUG-10**: No auto-seed in Docker CMD → fresh deploy tidak ada admin → locked out. Fix: entrypoint menjalankan seed di dev mode; `SEED_ON_START=true` untuk production (`docker-entrypoint.sh`).
- **BUG-11**: `migrate deploy` failure → `restart: unless-stopped` → infinite restart loop. Fix: entrypoint retry 3x dengan delay, lalu exit 1 setelah 30s sleep (`docker-entrypoint.sh`).

### Review Fixes — Batch 1 (Session 6)

#### Backup Permissions Hardening
- **BPH-01**: `createBackup()` — tambah `{ mode: 0o700 }` di `fs.mkdir`; tambah `fs.chmod(..., 0o600)` untuk `db.sql.gz`, `uploads.tar.gz`, `manifest.txt`. Sebelumnya backup files ikut default umask yang bisa `0644` (world-readable). Error asli di `catch` juga di-log via `this.logger.error()` — sebelumnya error ditelan.
- **BPH-02**: Test mock `fs/promises` tambah `chmod` mock agar test tidak `TypeError` jika ada unit test `createBackup()`.

#### SLA Cron Lock Safety
- **SLS-01**: `SLAService.checkSLA()` ganti `del(lockKey)` unconditional → compare-and-delete Lua script. Mencegah worker lain merelease lock yang bukan miliknya saat lock TTL expire sebelum `finally`.

#### Frontend Auth Cookie Handling
- **AUTH-03**: `apiClient` axios tambah `withCredentials: true`. Sebelumnya hanya refresh endpoint (`axios.post(...)`) yang explicit set credentials, login/logout cookie tidak terkirim untuk cross-origin deployment.
- **AUTH-04**: Password-change (`MyAccountPage`) dan restore-success (`AdminMaintenancePage`) sekarang panggil `/auth/logout` (`apiClient.post(..., .catch(() => {}))`) sebelum client-side cleanup (`logout()`, `queryClient.clear()`). Sebelumnya cuma client cleanup, refresh cookie tetap valid di server.

## Session 5 — Bug Fixes

### P0 — Critical
- **P0-03**: `restoreUploads()` EXDEV cross-device link — tempDir dipindah dari `path.dirname(uploadDir)` (overlay container filesystem) ke **dalam** `uploadDir` (Docker named volume, same filesystem). `fs.rename()` sebelumnya selalu gagal dengan `EXDEV` saat memindahkan file antar-filesystem di Docker. Saat clear upload dir, basename tempDir di-exclude dari penghapusan.
- **P0-04**: `restoreBackup()` error ditelan — `catch {` tanpa variabel error + tidak ada `Logger` di `MaintenanceService`. Error asli dari `restoreDatabase`/`restoreUploads` tidak pernah di-log. Fix: tambah `Logger` class, ubah ke `catch (error)`, log message + stack trace via `this.logger.error()`.

### P1 — High
- **P1-12**: Docker Compose setup gap — `docker-compose.yml` mereferensikan `backend/.env.db` dan `backend/.env.cache` (split SEC-023) tapi tidak ada template file maupun instruksi di README Quick Start untuk membuatnya. `docker compose up --build` gagal dengan "env file .env.db not found". Fix: tambah `backend/.env.db.example` + `backend/.env.cache.example`, update README Quick Start dengan dua `cp` commands, update header `.env.compose.example` merujuk ke file pendamping, perbaiki referensi stale di AGENTS.md & ARCHITECTURE.md.
- **P1-09**: `MaintenanceGuard` tidak mengizinkan Admin melewati maintenance — guard memblokir **semua** request selain allowed paths tanpa memeriksa role. Admin tidak bisa buka menu lain selain Maintenance. Fix: inject `JwtService`, verify JWT dari `Authorization` header saat maintenance enabled: Admin → allow; non-admin → 503; expired/invalid token → allow (biarkan `JwtAuthGuard` handle 401 → frontend refresh); no token → 503.
- **P1-10**: Frontend axios 503 handler redirect **semua** user ke `/admin/maintenance` (halaman admin-only) → redirect loop untuk non-admin → force logout/glitch. Fix: 503 handler hanya redirect jika `role === 'Admin'`; non-admin request di-reject tanpa redirect.
- **P1-11**: Frontend `MaintenanceBanner` hanya tampilkan banner kecil untuk semua user — non-admin masih bisa klik UI di belakangnya dan dapat error toast. Fix: Admin lihat banner kecil non-blocking; non-admin lihat full-screen overlay (`fixed inset-0 z-[60]`) yang memblokir interaksi. Polling `/maintenance/mode` tetap jalan (endpoint public, di-allow saat maintenance).

### Tests
- `maintenance.guard.spec.ts` (baru): 12 test case — admin allow, non-admin block, ITSupport block, expired/invalid token allow, no token block, allowed paths, `@SkipMaintenance()`, Redis unreachable fail-open, 503 response code/message.
- `maintenance.service.spec.ts`: tambah assertion untuk `logger.error` dipanggil dengan error asli; tambah test verifikasi tempDir dibuat di dalam `uploadDir` (mencegah EXDEV).

### Architecture Review Fixes (Session 5 — 2026-06-28)

#### Backend
- **ARCH-01**: Centralize MIME validation — `ALLOWED_MIME_TYPES`, `MIME_SIGNATURES`, `detectMimeFromMagicBytes`, `assertMimeTypeIntegrity` dipindah dari 4 file (comments.service, attachments.service, comments.controller, attachments.controller) ke shared `backend/src/common/utils/mime-validation.util.ts`. Menghilangkan ~155 baris duplikasi.
- **ARCH-06**: `MaintenanceService` error messages di-sanitize — catch blocks tidak lagi membocorkan `error.message` (stderr pg_dump/psql/tar) ke client. Pesan generik dikembalikan; detail internal hanya di server log. Pre-restore backup ID tetap dikembalikan di pesan restore.
- **ARCH-10**: `execFile` maxBuffer di `MaintenanceService` naik dari 1MB ke 16MB (`EXEC_MAX_BUFFER`) — mencegah buffer overflow pada tar listing/psql output besar.
- **ARCH-13**: CI tambah `npm audit --audit-level=high` step di kedua job (backend + frontend). Pipeline akan fail jika ada vulnerability high/critical.

#### Frontend
- **ARCH-11**: Shared `frontend/src/lib/constants.ts` — `ALLOWED_MIME_TYPES`, `MAX_DIRECT_ATTACHMENT_SIZE` (10MB), `MAX_COMMENT_ATTACHMENT_SIZE` (5MB), `MAX_TICKET_ATTACHMENT_SIZE` (5MB). Menghilangkan duplikasi dari 3 komponen (AttachmentList, CommentSection, CreateTicketForm).
- **ARCH-12**: Hapus inline type re-declarations di `AttachmentList.tsx` dan `CommentSection.tsx` — hooks sudah return typed `Attachment[]`/`Comment[]`, cast `as Array<{...}>` tidak diperlukan.
- **ARCH-05**: `LoginPage.tsx` validasi `from.pathname` (open-redirect mitigation) — konsisten dengan `use-auth.ts` yang sudah memvalidasi.
- **ARCH-07**: Axios interceptor early-reject refresh saat `accessToken` null — hindari percobaan refresh yang sia-sia di konteks unauthenticated.
- **ARCH-08**: `use-maintenance.ts` typed `apiClient.get<Blob>`, hapus `as unknown as AxiosResponse` double-cast.
- **ARCH-09**: `Navbar.tsx` pakai `unwrapData` + `ApiEnvelope<Notification[]>` helper, hapus manual `res.data.data` access.

## Session 4 — Security Fixes (CODE_REVIEW.md Session 4 — 2026-06-27)

### HIGH
- **SEC-001**: `validateEnv()` di `main.ts` enforce `COOKIE_SECURE=true` di production. `.env` diubah ke `NODE_ENV=development` untuk local HTTP-only dev.
- **SEC-002**: `JwtStrategy` dan `NotificationsGateway` explicit check `payload.tokenType !== 'access'` (sebelumnya truthy guard). `JwtPayload.tokenType` required.
- **SEC-003**: Account lockout setelah 10 failed login attempts (Redis, 15 menit lock window). `RedisService` tambah `incr()`/`expire()`.
- **SEC-004**: Nginx security headers di-repeat di setiap `location` block (add_header inheritance fix).
- **SEC-005**: Content-Security-Policy header untuk frontend SPA di nginx.
- **SEC-006**: `backend/.env` permission `600` (owner-only).
- **SEC-007**: `.gitignore` cover `.env.*` variants dengan `!.env.*.example` exception.
- **SEC-008**: Docker container hardening (`no-new-privileges`, `cap_drop: ALL`, `mem_limit`, `cpus`, `pids_limit`).
- **SEC-009**: `CommentRepository.findByTicketId()` `select` (bukan `include`) — exclude `path` field.

### MEDIUM
- **SEC-010**: Dummy bcrypt compare untuk user-not-found (timing side-channel mitigation).
- **SEC-013**: `JwtAuthGuard` global guard dengan `@Public()` decorator (fail-closed).
- **SEC-014**: `CommentsController.create()` gunakan `CreateCommentDto` class (ValidationPipe enabled).
- **SEC-015**: File extension whitelist di `buildSafeUploadPath()` — shared utility `upload.util.ts`.
- **SEC-016**: `originalName` sanitize (`path.basename()` + `substring(0, 255)`).
- **SEC-017**: Telegram link code 8 bytes/8 chars/case-sensitive (sebelumnya 4 bytes/6 chars/toUpperCase).
- **SEC-018**: Atomic Redis lock release via Lua script (TOCTOU race fix).
- **SEC-019**: `setMaintenanceMode(false)` check `RESTORE_LOCK_KEY`.
- **SEC-020**: Strong infrastructure credentials (`openssl rand`).
- **SEC-023**: Separate env files `backend/.env.db` dan `backend/.env.cache` (least-privilege).
- **SEC-025**: `@MaxLength(128)` pada LoginDto/ChangePasswordDto password fields.
- **SEC-026**: Magic byte signatures tambah OLE2 + text file null byte check.

### LOW
- **SEC-028**: Refresh TTL baca dari `JWT_REFRESH_TOKEN_EXPIRY` env (config drift fix).
- **SEC-029**: `changePassword()` clear refresh cookie.
- **SEC-033**: Frontend open redirect mitigation (`from.pathname` validation).
- **SEC-034**: `CreateTicketForm` MIME type validation.
- **SEC-036**: `ErrorBoundary` guard `console.error` dengan `import.meta.env.DEV`.
- **SEC-037**: `UserManagement` ganti `alert()` dengan `toast.error()`.
- **SEC-038**: `CreateTicketDto.description` `@MaxLength(10000)`.
- **SEC-039**: `QueryTicketDto` ID fields `@IsUUID()`.
- **SEC-040**: `QueryTicketDto.search` `@MaxLength(200)`.
- **SEC-042**: Download `Cache-Control: private, no-cache`.
- **SEC-043**: `MAX_FILES_PER_TICKET` check di comment attachments.
- **SEC-045**: `findWithTelegramCode()` `select` exclude password.
- **SEC-046**: `TelegramService` gunakan `findOrCreate()`.
- **SEC-047**: User reactivation response `reactivated: true` flag.
- **SEC-048**: Prevent self-deletion (`id === requesterId`).
- **SEC-049**: Nginx `default_server` block untuk unmatched Host.
- **SEC-050**: Nginx dotfile protection (`location ~ /\. { deny all; }`).
- **SEC-051**: `frontend/nginx.conf` security headers + CSP.
- **SEC-052**: Root `.env.example` deprecated.
- **SEC-053**: `backup.sh` manifest hapus `postgres_user`.
- **SEC-055**: `QueryUsersDto` `@MaxLength(200)` search, `@IsEnum(Role)` role.
- **SEC-056**: `RedisService` optional TLS (`REDIS_TLS=true`).
- **SEC-057**: JWT secret `openssl rand -hex 64` (128 hex chars).
- **SEC-059**: GitHub Actions CI workflow.

### Not Implemented (Low Priority / Risk Acceptance)
- **SEC-011**: Refresh token family-based revocation — breaking change, semua user perlu re-login. Ditangguhkan.
- **SEC-012**: Access token blacklist — accept 15min tradeoff (short-lived JWT).
- **SEC-027**: Separate `JWT_REFRESH_SECRET` — breaking change. Ditangguhkan.
- **SEC-030**: CSRF — risk acceptance `sameSite=strict` (no action needed).
- **SEC-031/032**: `@SkipMaintenance()` — sudah di-address via `@Public()` approach.
- **SEC-035**: `UserManagement` client-side validation — defense in depth, backend sudah validasi.
- **SEC-041**: Comments query-level attachment filter — post-query filter sudah adequate (defense in depth).
- **SEC-044**: Covered by SEC-017.
- **SEC-054**: `npm audit` — jalankan manual saat maintenance.
- **SEC-058**: Encrypt Telegram botToken at rest — ditangguhkan (kompleksitas vs risk).
- **SEC-060**: `as any` di `user.repository.ts` — noted, low priority type safety improvement.

## Session 3 — Code Review Fixes (CODE_REVIEW.md Sesi 3)

### P0 — Critical
- **P0-01**: `restoreBackup()` — maintenance mode sekarang tetap enabled saat restore gagal, bukan dimatikan. Menambahkan pre-restore backup ID ke error message. Test unit regression ditambah untuk kasus `restoreUploads` gagal dan `createBackup('pre-restore')` gagal.
- **P0-02**: Docker env templates — menambahkan `backend/.env.compose.example` (canonical untuk Docker Compose dengan `REDIS_PASSWORD`) dan `backend/.env.local.example` (untuk local dev). Root `.env.example` ditandai deprecated. README Quick Start diupdate ke `cp backend/.env.compose.example backend/.env`.

### P1 — High
- **P1-01**: Attachment list EndUser — filter visibility (`AttachmentVisibilityPolicy.buildVisibleAttachmentWhere()`) diterapkan sebelum `findMany` dan `count`, bukan setelah query di memory. Meta pagination sekarang mencerminkan jumlah attachment visible saja, bukan semua.
- **P1-02**: WebSocket token refresh — `useSocket()` sekarang depend pada `accessToken` dari Zustand store. Saat token berubah (refresh), socket di-reconnect dengan token baru.
- **P1-03**: Upload atomic cleanup — direct attachment upload dibungkus transaction (`attachmentRepository.transaction`); jika DB insert gagal, file yang sudah tersimpan dihapus. Comment creation juga di-transact: files disimpan dulu, lalu comment + attachment rows dibuat dalam satu transaction.
- **P1-04**: Status transition race — `updateStatus()` sekarang membaca status di dalam transaction, memakai conditional `updateMany({ where: { id, status: oldStatus } })`, dan return `409 Conflict` jika `count === 1` gagal (status sudah berubah).
- **P1-05**: User deactivation — `UsersService.update()` emit event `user.deactivated` saat `isActive` berubah dari `true` ke `false`. `AuthService` revoke all refresh tokens, `NotificationsGateway` disconnect semua socket user dan leave room.
- **P1-06**: EndUser master data — `GET /categories` sekarang return field minimal (`id`, `name`, `description`, `subCategories` aktif) untuk EndUser, dan data lengkap dengan `_count`/`slaConfigs` untuk Admin. `GET /sla-configs` dibatasi Admin-only. Subcategory list juga Admin-only.
- **P1-07**: Telegram polling restart — menambahkan `pollingGeneration` counter dan timeout handle. Setiap restart/shutdown increment generation; stale loops berhenti. Timeout di-clear saat shutdown.
- **P1-08**: Backup script maintenance guard — `scripts/backup.sh` sekarang refuse jalan saat maintenance mode off (kecuali `--live-ok`). Flag `--live-ok` menampilkan warning bahwa backup mungkin inconsistent.

### P2 — Medium
- **P2-01**: Pagination DTO — comment dan attachment endpoints sekarang gunakan `PaginationQueryDto` dengan `@Type(() => Number)`, `@IsInt()`, `@Min(1)`, `@Max(100)`. Invalid params return 400.
- **P2-02**: Telegram config DTO — menambahkan `UpdateTelegramConfigDto`, `TelegramSettingsDto`, `TelegramTemplatesDto`, `CheckTelegramConfigDto`. `enabledEvents` divalidasi `@IsIn()` untuk event whitelist. Body extra field ditolak.
- **P2-03**: SLA error handling — `SLAService.create()` precheck category existence dan catch Prisma `P2002` (ConflictException) / `P2025` (NotFoundException). Validasi `resolutionTimeMinutes >= responseTimeMinutes`.
- **P2-05**: Frontend pagination clamp — `TicketList`, `AttachmentList`, `CommentSection` sekarang auto-adjust `page` saat `totalPages` menyusut (setelah delete/filter).
- **P2-06**: `VITE_API_URL` — axios `baseURL`, refresh URL, dan socket namespace sekarang gunakan `import.meta.env.VITE_API_URL || '/api'`. `frontend/.env.example` diupdate.
- **P2-07**: Redis healthcheck — password tidak lagi di-pass via `redis-cli -a` (insecure); sekarang pakai `REDISCLI_AUTH` env. Redis command generate config file via `umask 077` + temp file.
- **P2-08**: nginx real IP — hapus `set_real_ip_from` private ranges dan `real_ip_header` karena tidak ada upstream reverse proxy di compose default.

### P3 — Low/Medium
- **P3-01**: Login redirect — login sekarang redirect ke `location.state.from.pathname` (dari `ProtectedRoute`) jika ada, fallback `/tickets`.
- **P3-02**: Notification count drift — `useMarkAsRead` sekarang invalidasi `notifications-unread-count` query setelah success, bukan decrement lokal.
- **P3-03**: Telegram assignment subject — `ticket.assigned` event sekarang include `subject: ticket.subject`.
- **P3-04**: Thumbnail object URL — `thumbnailCache` dibatasi 100 entries; entry overflow di-revoke dan dihapus.
- **P3-05**: DTO trim/whitespace — `CreateCategoryDto`, `CreateSubCategoryDto`, `CreateUserDto` sekarang pakai `@Transform(trimString)` + `@IsNotEmpty()` untuk name/email, `@MaxLength()` untuk semua string fields.

### Frontend UX Improvements
- Attachment upload: client-side file type/size validation sebelum upload (feedback cepat tanpa roundtrip).
- Comment attachment: client-side file type validation sebelum submit.
- Status update / priority change / assign / delete: semua mutation sekarang tampilkan `toast.error()` saat gagal (bukan silent fail).
- Export CSV: `toast.error()` saat gagal (bukan silent fail).
- Attachment download/preview: `toast.error()` saat gagal.

### Docs & Infra
- README Quick Start diupdate: gunakan `backend/.env.compose.example` untuk Docker Compose, `backend/.env.local.example` untuk local dev.
- Backup script: dokumentasi `--live-ok` flag dan maintenance requirement.
- Nginx: dokumentasi topology proxy di README.

## Session 2 — Performance (CODE_REVIEW.md Ses 2)
- **PERF-01**: Tambah database indexes untuk query panas — `categoryId`, `subCategoryId`, `slaStatus`, `updatedAt`, `requesterId+createdAt`, `assignedToId+status`, `status+slaStatus` pada tickets; `ticketId+createdAt`, `userId` pada comments; `ticketId+visibility`, `userId` pada attachments; `userId+isRead+createdAt` pada notifications; `ticketId+createdAt` pada ticket_history; `createdAt` pada users.
- **PERF-02**: Migration raw SQL untuk `pg_trgm` extension + 5 GIN trigram indexes untuk search ILIKE pada tickets (subject, description, ticketNumber) dan users (name, email).
- **PERF-03**: Hilangkan N+1 query pada EndUser ticket list — ganti `for..await` per-ticket count dengan batch aggregate via `$queryRaw` (`countPublicCommentsByTicketIds`, `countVisibleAttachmentsByTicketIds`).
- **PERF-04**: SLA cron ganti offset pagination (`skip: processed`) ke keyset pagination (`id > lastId`) — mencegah degradasi batch akhir dan duplikasi/ skip data.
- **PERF-05**: Ganti `generateTicketNumber()` dari `MAX(SUBSTRING(…))` full table scan ke `nextval('ticket_number_seq')` PostgreSQL sequence O(1). Hapus `isolationLevel: 'Serializable'` karena sequence menghilangkan dependency. Migration `setval` dari data existing.
- **PERF-06**: Dashboard stats: tambah Redis cache key `dashboard:stats:v1` TTL 30 detik + `invalidateCache()`; SLA stats 4 count queries di-gabung jadi 1 query `COUNT(*) FILTER(WHERE...)`; daily trends ganti fetch semua ticket + loop Node ke SQL `date_trunc` + `GROUP BY`.
- **PERF-07**: CSV export pertahankan `MAX_EXPORT_ROWS=10000` guard; streaming untuk data besar dicatat sebagai future improvement.
- **PERF-08**: `LocalStorageService` ganti `fs.existsSync`/`mkdirSync`/`writeFileSync`/`unlinkSync` ke `fs.promises` async.
- **PERF-10**: Notification broadcast pakai `runWithConcurrency(users, 5, ...)` — 5 concurrent create; Telegram send pakai concurrency limit 3 + `Promise.allSettled`.
- **PERF-11**: `MaintenanceGuard` tambah in-memory cache 2 detik + `mget` untuk enabled + message — kurangi Redis round-trip per request.
- **PERF-12**: Route-level code splitting: semua page imports diganti `React.lazy()` + `Suspense` fallback. Build output menampilkan chunk terpisah per page.
- **PERF-13**: Nginx tambah `location /assets/` dengan `Cache-Control: public, max-age=31536000, immutable`; `index.html` no-cache.
- **PERF-14**: `SubCategoryManager` hilangkan N+1 request per-category — derive subCategories dari `useCategories()` yang sudah include `subCategories`.
- **PERF-15**: Navbar notification dropdown query tambah `enabled: notifOpen` + `staleTime: 30_000`.
- **PERF-19**: TanStack Query staleTime tuning — categories 30 menit, assignable users 10 menit, telegram config 5 menit.
- **PERF-20**: Backup listing limit 50 terbaru untuk hindari `Promise.all` besar.

## Initial Development

Initial feature development, infrastructure setup, and early code review rounds.

### Prisma Migration
- Migration `20260626001000_add_perf_indexes`: tambah 15+ indexes, pg_trgm extension + 5 GIN indexes, `ticket_number_seq` sequence, dan partial index `tickets_resolved_category_partial_idx`.

### Redis
- Tambah `mget()` method ke `RedisService` untuk multi-key get atomik.
- DashboardModule import `RedisModule` untuk inject `RedisService`. (Karena tidak ada @Global)

### Docker
- Build: ganti bind mount `./frontend/dist` → named volume `frontend_dist` + frontend builder service (fix 403)
- Build: tambah `COPY postcss.config.js` & `COPY tailwind.config.js` ke Dockerfile (fix Tailwind tidak terproses)
- Build: hapus `COPY public ./public` (direktori tidak ada)
- Container: frontend service pakai `exec tail -f /dev/null` biar stay running (tidak exit code 0)
- Seed: compile `seed.ts` ke JS otomatis di startup, `upsert` update password tiap restart
- Redis: support `REDIS_URL` (ioredis) sebagai fallback `REDIS_HOST`/`REDIS_PORT`
- .env.example: tambah `REDIS_HOST` & `REDIS_PORT`

### Tickets
- Create: EndUser bisa akses menu/form New Ticket dan `POST /api/tickets` untuk membuat ticket sendiri
- Create: **FE-06** — partial success handling: jika ticket sudah dibuat tapi upload gagal, tampilkan warning + navigasi ke detail ticket (bukan error misleading)
- Status: tambah `OnHold` ke frontend (type, color, badge, statusFlows)
- Status Flows: samakan dengan backend (`Closed → Open`, `InProgress → OnHold/Resolved`)
- Status: clear `closedAt`/`resolvedAt` saat reopen ticket
- Priority: dropdown editable di tabel Tickets (ITSupport/Admin)
- Category: kolom baru di tabel Tickets
- Number: format `TKT-XXX` (sequential, tanpa YYMM)
- Delete: tambah tombol Delete (Admin only) + ConfirmDialog di detail & list
- Kolom Created By, Assigned To dropdown di list (ITSupport/Admin)

### Frontend UI/UX
- Dark Mode: `tailwind darkMode: 'class'`, theme-store zustand persist, toggle di sidebar
- Sidebar: minimize/expand (collapsed state, icon-only mode)
- Sidebar: New Ticket tidak ikut nge-highlight menu Tickets (NavLink `end` prop)
- PasswordInput: reusable dengan eye icon (hold to reveal)
- Waktu: formatDateTime jadi 24H (HH:mm)
- Notifikasi: dropdown toggle di Navbar + Mark all as read
- Notifikasi: **FE-03** — badge unread memakai `GET /notifications/unread-count` (server-side) + auto-refresh 30s; `useNotifications()` untuk list saja
- ErrorBoundary: wrapping App + route `/notifications`
- ProtectedRoute: fix envelope access `res.data.data.accessToken/user` — session restore setelah reload/deep link sekarang berfungsi (FE-01)
- Admin Master Data: fix unwrap API envelope `res.data.data` — gunakan `useCategories()` hook dan `unwrapData()` untuk kategori/subkategori (FE-02)
- Pagination: **FE-04** — hapus opsi "All" yang mengirim `limit=0` (invalid di backend); guard tambahan di `useTickets()` untuk skip `value === 0`
- Pagination: **FE-08** — tambah Previous/Next buttons untuk mobile (visible di bawah `sm` breakpoint)
- Telegram: **FE-05** — `useTelegramStatus()` dan `useTelegramConfig()` hanya fetch untuk Admin; non-admin tidak trigger request 403

### Users & Auth
- Role: Change Password hanya untuk Admin & ITSupport
- Role: Dashboard & New Ticket hide untuk EndUser
- Users: ITSupport bisa GET `/users` (assign dropdown)
- Users: `includeInactive=true` — user tetap terlihat setelah di-deactivate
- Users: hard-delete dengan transaction (FK error → "Deactivate the user instead")
- ValidationPipe: UpdateUserDto tambah field `isActive` (fix forbidden non-whitelisted)
- Auth: fix admin login gagal — password hash terupdate tiap restart
- Auth: **SECURITY** — tambah `tokenType` claim (`access`/`refresh`) ke JWT; refresh token tidak bisa dipakai sebagai Bearer API/WebSocket; validasi di JwtStrategy, Gateway, dan refresh/revoke (AUTH-01)
- Auth: **AUTH-02** — logout tidak memerlukan access token valid; cukup refresh cookie untuk revoke
- My Account: halaman `/my-account` untuk semua role, berisi profil & change password
- Change Password: pindah dari sidebar ke halaman My Account (bukan route terpisah)
- Change Password: **FE-09** — setelah change password, session di-clear dan redirect ke login
- Profile dropdown: Navbar — avatar user, My Account, theme toggle, Logout

### Dashboard
- SLA Compliance: fix literal `\n` di tooltip
- Ticket Trend: tampilkan "No activity" jika semua count 0
- Auto-refresh setelah ticket status/priority/assign berubah
- Category resolution: fix typo `avgMinutes` → `avgResolutionMinutes`
- Avg Resolution Time: unit cerdas — tampilkan jam (`≥60m`), menit (`≥1m`), atau detik (`<1m`) sesuai nilai
- `getDashboardStats()` dipindah dari TicketsService ke DashboardService — pemisahan concern yang benar
- Avg resolution time: ganti in-memory loop jadi raw SQL (`$queryRaw`) — lebih cepat untuk dataset besar

### Master Data
- Categories/Sub-categories: reactivate soft-deleted record saat create dengan nama sama
- Cross-invalidation categories ↔ subcategories
- Fix URL sub-categories: tambah `categoryId` di path update/delete
- Toast error handling di Master Data

### Comments & File Upload
- Backend: `POST /tickets/:ticketId/comments` kini menerima multipart/form-data dengan field `content`, `type`, dan `files` (max 3 file, 5MB each, allowed MIME types)
- Backend: `commentId` (optional) ditambahkan ke model Attachment — file terupload di link ke comment
- Frontend: CommentSection — tambah tombol "Attach files" dengan file list + remove, thumbnail preview untuk gambar
- Frontend: comment card — tampilkan attachment list dengan thumbnail preview (image) & tombol Download, modal full-size preview untuk gambar
- Prisma: `db push` untuk menambahkan kolom `commentId` + index
- Validasi MIME type dan file size dilakukan sebelum comment dibuat (bukan setelah) — rollback jika file gagal
- Semua file divalidasi dalam batch sebelum satupun diproses
- Attachment: **ATT-01** — attachment komentar `INTERNAL` otomatis disimpan sebagai `INTERNAL`; nested attachment difilter untuk EndUser menggunakan `AttachmentVisibilityPolicy`
- Comment: **FE-07** — `useAddComment()` invalidate `['ticket', id, 'attachments']` saat komentar membawa file

### Filter, Date, Sorting
- Assigned to Me: filter by current user ID (sebelumnya tidak berfungsi)
- Date Range: ganti 2 date picker terpisah jadi dropdown preset (All Time, Today, Last 7 Days, Last 30 Days, This Month, Custom) — hemat tempat
- Attachment upload: max 3 files, max 5MB each (New Ticket)
- Input date muncul hanya saat pilih Custom
- Backend: `dateTo` di-set ke 23:59:59.999 UTC agar ticket yang dibuat setelah tengah malam tetap terfilter
- Custom: start date `max` dibatasi end date, end date `min` dibatasi start date
- Backend `GET /api/tickets`: tambah sort fields `ticketNumber`, `subject`, `status` ke whitelist (`allowedSortFields`)
- Frontend: column headers Ticket #, Subject, Status, Priority, Created jadi clickable sort — toggle asc/desc
- Sort indicator (arrow icon) pada active sort column, semi-transparent panah pada inactive column
- Sort state (`sortBy`/`sortOrder`) di `FilterValues`, berubah via `onFiltersChange` → reset page ke 1
- Backend `sortBy` whitelist: `createdAt`, `updatedAt`, `slaDueAt`, `priority`, `ticketNumber`, `subject`, `status`

### Items Per Page
- Frontend: dropdown "Items per page" (10, 25, 50, 100) di pagination area, applies immediately tanpa tombol Apply
- Backend: `limit=0` support untuk "All" (return semua data tanpa pagination) — kemudian dihapus di FE-04
- Frontend: `limit` ditambahkan ke `FilterValues`, reset page ke 1 saat berubah
- Pagination component: tampilkan items per page dropdown + total items count, hide page buttons saat "All"

### Security
- Env: `validateEnv()` di startup — throw jika `JWT_SECRET`/`DATABASE_URL` tidak diset
- JWT: hapus hardcoded `'super-secret-key'` fallback di 3 file (auth.module, jwt.strategy, auth.service)
- JWT: **OPS-02** — tambah `change-this-to-random-secret` ke denylist + enforce minimum 32 chars di production
- WebSocket: validasi JWT via `jwtService.verify()` di handshake gateway (S-2)
- Auth: refresh token pindah ke httpOnly cookie (`secure`, `sameSite: strict`, path `/api/auth`)
- Auth: access token hanya di memory (zustand tanpa persist) — tidak ada token di localStorage
- Auth: silent refresh otomatis di `ProtectedRoute` saat page reload
- Auth: **OPS-03** — helper `getRefreshCookieOptions()` seragam login/refresh/logout + `COOKIE_SECURE` env untuk explicit control
- Ticket: `findById` filter untuk EndUser — hanya bisa lihat ticket milik sendiri (S-4)
- Backend: global exception filter (`HttpExceptionFilter`) — semua error terformat konsisten `{ error: { code, message } }`
- Backend: helmet security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, dll)
- Backend: morgan request logging (stdout, tertangkap Docker logs)
- Backend: CORS lockdown via env `CORS_ORIGIN` (dipisah koma untuk multi-origin)
- Backend: redis-url validation — `REDIS_URL` wajib diset, startup throw jika tidak ada
- Backend: Prisma connection pool — via `DATABASE_POOL_MAX` env (default 10, `connection_limit` di connection string)
- Backend: `esModuleInterop: true` di tsconfig + perbaiki import cookieParser jadi default import
- Backend: packages baru — `helmet@6`, `morgan`, `@types/morgan`
- Ticket: `PATCH /:id/status` — EndUser hanya bisa close own resolved ticket (`Resolved → Closed`), ownership + role di-service
- WebSocket: `handleConnection()` cek `user.isActive` di DB (tidak hanya verify JWT) — disconnect jika user dinonaktifkan
- Env: `backend/.env` — `JWT_SECRET` diganti random 256-bit hex, `CORS_ORIGIN` diisi

### Post-Code-Review Fix
- Fix: `useTicketAuditTrail` dihapus (B-1) tapi `TicketDetail.tsx` masih import & pakai — ganti ke `ticket.histories`
- Fix: Tambah `histories`, `comments`, `attachments` ke `Ticket` interface (types/index.ts)
- Fix: `frontend/node_modules` & `frontend/dist` ownership root (dari Docker) — `rm -rf` & reinstall

### Export CSV
- Backend: `GET /api/tickets/export/csv` (ITSupport/Admin only) — download CSV dengan filter yang sama seperti list
- Frontend: Tombol "Export CSV" di header TicketsPage (ITSupport/Admin)
- CSV headers: Ticket #, Subject, Status, Priority, Category, Sub Category, Created By, Assigned To, Created At, Resolved At, SLA Status
- CSV: export quote semua field dan neutralize formula injection (`=`, `+`, `-`, `@`, tab, CR)

### Notifications
- Backend: `DELETE /api/notifications` — hapus semua notifikasi user
- Frontend: Tombol "Clear all" di NotificationsPage & dropdown Navbar
- `ticket.created`: notifikasi dikirim juga ke requester (jika bukan ITSupport/Admin)
- `ticket.status.updated`: event selalu di-fire (tidak hanya untuk assigned tickets), notifikasi dikirim ke assignee + requester
- Payload event ditambah field `subject` dan `requesterId`

### Theme
- Dark Mode: `tailwind darkMode: 'class'`, theme-store zustand persist
- Theme switcher: Light/Dark ada di profile dropdown Navbar

### Login
- Bug: axios interceptor ikut nge-handle 401 dari `/auth/login` dan nyoba refresh token — error asli "Invalid email or password" ketelan
- Fix: tambah pengecualian `/auth/login` di axios interceptor
- Fix: tambah `toast.error()` di `useLogin` hook biar error muncul sebagai toast

### Telegram
- Backend: tambah `POST /api/telegram/test-notification` (Admin only) + `sendTestNotification()` method
- Backend: `sendTestNotification()` membaca settings (groupChat/individual) — kirim sesuai preferensi
- Backend: group chat failure tidak blocking — fallback ke individual, error dilaporkan sebagai partial failure
- Backend: validasi real-time dari Telegram API — throw `BadRequestException` jika gagal (token tidak dikonfigurasi, akun tidak link, atau error dari Telegram)
- Frontend: tombol "Test Notification" di My Account (Admin) — muncul hanya saat Telegram sudah link
- Frontend: toast success/error — menampilkan pesan error asli dari backend/Telegram API
- Fix: `sendTestNotification` tidak throw partial failure jika group chat gagal tapi individual berhasil — cukup return success + server-side log
- Fix: `updateConfig` support clear bot token (kirim `""` → hapus dari DB, fallback ke env var)
- Backend: tambah `POST /api/telegram/check` (Admin only) + `checkConfig()` method
- Backend: `checkConfig()` validasi bot token via `getMe` API + group chat ID via `getChat` API
- Frontend: tombol "Check" di Bot Settings — validasi real-time, tampilkan status inline ✅/❌
- Frontend: validasi Group Chat ID — "Save Settings" disable + pesan error jika group chat di-enable tapi ID kosong
- Telegram: fix create config typo dan clear bot token hanya saat token field diubah
- Fix: **TG-01** — `generateLinkCode()` sekarang buat 6-char code (sebelumnya 10-char), bot handler terima 6-char

### Production Readiness
- Maintenance Mode: global `MaintenanceGuard` blocks non-admin API requests when `maintenance:enabled=1` in Redis; allowed endpoints: `/health`, `/maintenance/*`, `/auth/*`
- Maintenance Mode: health endpoint includes `maintenance: { enabled, message }` in response for frontend polling
- Maintenance Mode: `GET /api/maintenance/mode` (public) + `PATCH /api/maintenance/mode` (Admin) for manual toggle
- Maintenance Mode: frontend `MaintenanceBanner` polls health every 5s, shows amber overlay when maintenance active
- Maintenance Mode: Admin must enable maintenance first before backup/restore buttons are active in UI
- Maintenance Mode: auto-enable before restore (5s drain), auto-disable after restore completes
- Backup: detail isi `db.sql.gz` ditambahkan ke docs (semua tabel public schema); Redis tidak di-backup
- Maintenance UI: tambah route Admin `/admin/maintenance` untuk create/list/download/delete backup DB dan uploads
- Maintenance UI: tombol Delete backup memakai `ConfirmDialog` standar dan menghapus folder backup timestamp
- Maintenance UI: tombol Restore melakukan restore penuh DB + uploads dengan typed confirmation dan logout paksa setelah sukses
- Maintenance API: tambah endpoint Admin-only `/api/maintenance/backups`, download backup DB/uploads, dan `DELETE /api/maintenance/backups/:id`
- Maintenance API: tambah `POST /api/maintenance/backups/:id/restore`; validasi gzip, buat pre-restore backup otomatis, restore DB via `psql`, restore uploads via `tar`
- Backup UI: tombol `DB` download `db.sql.gz`; tombol `Uploads` download `uploads.tar.gz`
- Docker: API image install `postgresql-client-16`, `gzip`, `tar`, `gosu`; mount `./backups:/app/backups` untuk backup dari UI
- Docker: tambah `backend/docker-entrypoint.sh` untuk chown `/app/uploads` dan `/app/backups` sebelum drop ke user `node`
- Backup: UI backup parse `DATABASE_URL` ke env libpq untuk `pg_dump`, menjaga `schema` sebagai `--schema`, dan menghindari pipeline yang menutupi error dump
- Backup: tambah `scripts/backup.sh` untuk membuat `db.sql.gz`, `uploads.tar.gz`, dan `manifest.txt` ke `backups/<timestamp>/`
- Backup: `backups/` ditambahkan ke `.gitignore`
- Seed: production Docker CMD tidak lagi menjalankan seed otomatis; restart container tidak mereset credential default
- Seed: `prisma/seed.ts` tidak lagi update password user default yang sudah ada; sample ticket dilewati saat `NODE_ENV=production`
- Docker: tambah `restart: unless-stopped` di semua service — auto-restart saat crash
- Docker: tambah healthcheck di service `api` (`GET /api/health`, interval 30s, start_period 30s)
- Docker: tambah logging config (`json-file`, max-size 10m, max-file 3) — cegah disk penuh
- Prisma: ganti `npx prisma db push` → `npx prisma migrate deploy` di Dockerfile CMD — migration versioned, aman, rollbackable
- Prisma: initial migration `20260623000000_init` dibuat dari `prisma migrate diff` + resolve
- Docker: backend image pakai `npm ci`, `npm ci --omit=dev`, `USER node`; API host port bind ke `127.0.0.1:3000`

### HTTPS
- Nginx: tambah SSL/TLS via mkcert (self-signed CA) — domain `helpdesk.rsmch.internal`
- Nginx: listen port 80 untuk redirect 301 → HTTPS, port 443 untuk SSL
- Nginx: mount `./nginx/certs` volume untuk SSL cert & key
- Docker: expose port 443 di service nginx
- Git: ignore `nginx/certs/` biar private key tidak ter-commit
- Healthcheck: fix URL dari `/api/health` → `/health` (app tidak pakai global prefix)
- Backend: fix Dockerfile — tambah `wget` ke apt-get install untuk healthcheck

### SLA
- `performSLACheck()` pakai batch pagination 500/trip (P-1)
- `performSLACheck()` ganti per-ticket `update` jadi `updateMany` batch — mengurangi jumlah query dari N menjadi max 3 per batch

### Prisma Indexes
- User: tambah composite index `(role, isActive)` — percepat query filter role + status aktif
- TicketHistory: tambah index `(userId)` — percepat query history per user
- Prisma: migration `20260624000000_add_missing_indexes` menambahkan index `(role, isActive)` dan `ticket_history(userId)`

### Repository Pattern
- Backend: tambah `common/repositories/` dengan 9 domain repository — abstraction layer di atas PrismaService
- Backend: semua service sekarang inject repository (e.g., `TicketRepository`) bukan `PrismaService` langsung
- Backend: `RepositoriesModule` (@Global) — import sekali di `AppModule`, export semua repository
- Backend: `tickets.service.spec.ts` — update mock dari `PrismaService` ke repository mock

### Frontend Restructuring
- Auth: pindah dari `components/auth/` → `auth/` (top-level sub-module)
- Layout: pindah dari `components/layout/` → `layout/` (top-level sub-module)
- Hapus `ChangePasswordPage.tsx` (unused dead code)
- Update import paths di `App.tsx` & `LoginPage.tsx`
- tsconfig: tambah `forceConsistentCasingInFileNames: true`

### Code Review Hardening — Security & Deployment
- Backend: `POST /api/tickets` dibatasi ke ITSupport/Admin; frontend route `/tickets/new` dan tombol Create Ticket ikut role-gated
- Backend: EndUser ownership check ditambahkan untuk create comment, upload/list attachment, dan download attachment
- Backend: attachment dari internal comment difilter dari ticket detail/list/download untuk EndUser
- Auth: inactive user ditolak saat login; logout membaca refresh cookie dan revoke token Redis (`refresh:{sub}:{jti}`)
- Upload: Multer `limits` + MIME `fileFilter` di comment/attachment endpoint; nginx `client_max_body_size 10m`
- Error: non-HTTP exception tidak membocorkan internal message ke client
- Ticket: generate number + create ticket + initial history dalam satu serializable transaction dengan retry; inactive category/sub-category ditolak
- Assignment: `assignedToId: null` support unassign ticket
- Frontend: `getErrorMessage()` support `{ error: { message } }`, `useUsers()` hanya enabled untuk role assign, MyAccount hydration pindah ke `useEffect`

### Code Review Fixes (CR-01 to CR-12)
- CR-01 (Critical): Upload filename aman — `buildSafeUploadPath()` extract extension via `path.extname(path.basename())` + containment check; `LocalStorageService` defense-in-depth
- CR-02 (Critical): Restore gagal tidak lagi mematikan maintenance mode — `restoreSucceeded` flag, `createBackup('pre-restore')` dilakukan setelah maintenance aktif + drain
- CR-03 (High): Production seed wajib env `SEED_ADMIN_PASSWORD` dan `SEED_SUPPORT_PASSWORD`; dev tetap pakai default credential; password production tidak di-log
- CR-04 (High): `prisma` dipindah dari `devDependencies` ke `dependencies`; Dockerfile CMD pakai `npx --no-install prisma migrate deploy`
- CR-05 (High): `generateTicketNumber()` pakai raw SQL `MAX(CAST(SUBSTRING(...)))` alih-alih string sort — fix duplikat setelah TKT-999
- CR-06 (High): `getConfig()` Telegram strip `groupChatId` dari response; frontend hanya terima `hasGroupChatId` flag
- CR-07 (Medium): EndUser bisa close own resolved ticket via tombol `Close Ticket` di TicketDetail
- CR-08 (Medium): Axios refresh queue reject saat `accessToken` null — pending requests tidak hang
- CR-09 (Medium): Nginx tambah `location /socket.io/` dengan WebSocket upgrade headers
- CR-10 (Medium): `backup.sh` baca dari `backend/.env` (canonical source); `docker-compose.yml` db service `env_file: ./backend/.env`; tambah `POSTGRES_USER/PASSWORD/DB` ke `.env.example`
- CR-11 (Medium): EndUser `_count` hanya hitung visible comments/attachments (public + direct), bukan semua
- CR-12 (Medium): SLA controller pakai DTO classes (`CreateSlaConfigDto`, `UpdateSlaConfigDto`) dengan `class-validator` decorators
- Bug fix: raw SQL `generateTicketNumber()` koreksi nama tabel dari `"Ticket"` ke `"tickets"` (Prisma PostgreSQL default snake_case plural)

### Security Review Fixes (SEC-001 to SEC-016, SEC-019, SEC-020)
- WebSocket: access token hanya diterima dari Socket.IO `auth`, bukan query string.
- Auth: refresh token user direvoke saat password berubah/reset/deactivate; frontend refresh interceptor sekarang update `user` state.
- Restore: validasi archive upload backup terhadap path traversal/symlink/hardlink dan restore via temporary directory swap.
- Dependencies: override `tar` ke versi fixed; `multer` high masih butuh migrasi NestJS 11.
- Users/RBAC: `/users` dibatasi Admin-only, assignment memakai endpoint minimal `/users/assignable`.
- Tickets: EndUser tidak menerima audit trail; status/assign/priority update dan history insert dibuat atomic; assignment ke inactive user ditolak.
- Attachments: tambah `Attachment.visibility` (`PUBLIC`/`INTERNAL`), magic-byte upload validation, safe `Content-Disposition`, stream error handling, dan UI selector/badge visibility.
- Pagination: DTO pagination bounded (`limit` min 1 max 100) untuk menghindari query unbounded.
- Telegram: link/unlink/status Admin-only, link code memakai `crypto.randomBytes()`, dan template variables di-escape untuk Telegram HTML.
- Backup: create backup wajib maintenance mode, dilindungi Redis lock, dan restore/logout flow clear React Query cache.
- Deployment: Redis compose service memakai `REDIS_PASSWORD`/`requirepass`, API startup production mewajibkan `REDIS_PASSWORD`, dan nginx menambahkan security headers.
- Frontend: React Query Devtools hanya dirender saat development; EndUser dapat change password sendiri.
- Env/seed: production menolak weak `JWT_SECRET` placeholder dan seed production tetap wajib `SEED_ADMIN_PASSWORD`/`SEED_SUPPORT_PASSWORD`.

### Code Review Fixes — F-01 & F-02 (Phase 0)
- F-01 (P0): Centralized attachment visibility policy (`AttachmentVisibilityPolicy`) — EndUser hanya bisa melihat PUBLIC direct attachments dan attachments dari PUBLIC comments. Policy diterapkan di `TicketsService.findAll`, `TicketsService.findById` (count), `AttachmentsService.findByTicketId`, dan `AttachmentsService.getDownloadInfo`. Sebelumnya: direct attachment INTERNAL bocor karena filter hanya mengecek `commentId: null OR comment.type: PUBLIC` tanpa cek `visibility`.
- F-01: Tambah 12 unit test untuk visibility boundary (EndUser/ITSupport/Admin).
- F-02 (P1): Register `TransformInterceptor` global via `APP_INTERCEPTOR` — semua success response di-wrap `{ data, meta? }` secara konsisten. Stream/CSV/blob responses di-skip.
- F-02: `HttpExceptionFilter` gunakan `resp.code` jika ada, fallback ke `getCodeFromStatus(status)` — menghasilkan code stabil (`BAD_REQUEST`, `NOT_FOUND`, `MAINTENANCE`, dll) bukan `resp.error` Nest default.
- F-02: `MaintenanceGuard` throw exception dengan `code: 'MAINTENANCE'` eksplisit.
- F-02: Frontend tambah `ApiEnvelope<T>`, `unwrapData<T>()`, `unwrapPage<T>()`, `unwrapBlob()` helpers. Semua hooks di-update untuk gunakan adapters.
- F-02: Hapus `refreshToken` dari `AuthResponse` type (drift fix — frontend tidak menerima refresh token di body, hanya httpOnly cookie).
- F-02: `NotificationsPage` fix `data.data` → `data` (sudah unwrap oleh interceptor).

### Code Review Fixes — CODE_REVIEW.md (Sesi 1-14)
- **AUTH-01**: Tambah `tokenType` claim (`access`/`refresh`) ke JWT; `JwtStrategy` dan `NotificationsGateway` reject non-access tokens; `refresh()` validasi `tokenType === 'refresh'` + `jti` + compare stored Redis token.
- **FE-01**: Fix `ProtectedRoute` baca `res.data.data.accessToken/user` (envelope access) + tambah type `RefreshResponse`.
- **FE-02**: Fix `MasterDataManagement` pakai `useCategories()` hook + `unwrapData()` + `Promise.all` untuk subcategories.
- **OPS-02**: Tambah `change-this-to-random-secret` ke denylist + enforce min 32 chars JWT_SECRET di production.
- **OPS-03**: Tambah `getRefreshCookieOptions()` helper (login/refresh/logout) + `COOKIE_SECURE` env; fix logout `clearCookie` pakai options yang sama.
- **TG-01**: Fix `generateLinkCode()` buat 6-char code (sebelumnya 10-char, bot validator expect 6).
- **AUTH-02**: Hapus `@UseGuards(JwtAuthGuard)` dari logout endpoint — cookie-based revoke only.
- **FE-09**: After change password: `logout()`, `queryClient.clear()`, redirect ke `/login` dengan message.
- **ATT-01**: Internal comment attachments auto-set `visibility: INTERNAL`; EndUser nested attachments difilter via `AttachmentVisibilityPolicy`.
- **FE-04**: Hapus opsi "All" dari Pagination; tambah `value !== 0` guard di `useTickets()`.
- **FE-05**: `useTelegramStatus()` dan `useTelegramConfig()` accept `enabled` option; MyAccountPage pass `enabled: isAdmin`.
- **FE-07**: `useAddComment()` invalidate `attachments` query saat files ada.
- **FE-03**: Baru `useUnreadNotificationCount()` hook panggil `/notifications/unread-count` (server-side) + auto-refresh 30s.
- **FE-06**: Partial success: per-file upload errors caught, navigasi ke `/tickets/:id`.
- **FE-08**: Mobile Previous/Next buttons visible di bawah `sm` breakpoint di Pagination.
- **OPS-01**: Update `backend/.env.example` dengan Docker vs local dev comments.
- **OPS-08**: Tambah `umask 077` + `chmod 700/600` di backup dirs/files di `scripts/backup.sh`.
- **CAT-01**: `delete()` di categories.service.ts cek `_count.subCategories` dan `_count.slaConfigs` sebelum hard delete; soft-deletes jika ada relations.
- **OPS-09**: `backup.sh` ganti `source .env` dengan targeted `grep` untuk parse `POSTGRES_USER`/`POSTGRES_DB`.
- **OPS-06**: Tambah `location /api/maintenance/` di `nginx.conf` dengan `proxy_read_timeout 600s`.
- **DATA-01**: Pindah file deletion di `tickets.service.ts delete()` SETELAH DB transaction commit.
- **SLA-02**: Tambah `setNx(key, value, ttl)` ke `RedisService` pakai `SET NX EX`; `checkSLA()` pakai atomic `setNx()`.
- **ATT-02**: `AttachmentRepository.findByTicketId()` accept `{ select?, include? }`; `attachments.service.ts` pakai `ATTACHMENT_SAFE_SELECT` exclude `path`.
- **SLA-01**: `updatePriority()` recalc `slaDueAt` dari `createdAt`, compute `slaStatus`.
- **OPS-04**: Tambah `RESTORE_LOCK_KEY` dengan `SET NX EX` (30min TTL) untuk restore process.
- **OPS-10**: Dokumentasi Redis persistence tradeoff di `AGENTS.md`.
- **FE-10**: `CreateTicketForm.tsx` filter `categories` hanya `isActive === true`.
- **API-01**: Tambah `QueryUsersDto` dan `QueryNotificationsDto` di `pagination-query.dto.ts`.
- **OPS-05**: `assertSafeTarArchive()` pakai `tar -tzvf` dan reject symlink/hardlink entries.
- **OPS-07**: `nginx.conf` `client_max_body_size` naik dari `10m` ke `20m`.
- **API-02**: `exportCsv()` tambah `take: 10000` limit.
- **OPS-11**: Production seed rotate passwords via `update: { password }` di upsert.
- **OPS-12**: `start:prod` ganti dari `node dist/main` ke `node dist/src/main`.
- **OPS-13**: Tambah `set_real_ip_from` untuk private ranges + `real_ip_header X-Forwarded-For`.
- **TG-02**: Schema migration `20260626000000_add_telegram_config_singleton_key` tambah `key String @unique @default("default")` ke `TelegramConfig`.
- **OPS-04 lock**: Tambah `acquireLock()`/`releaseLock()` helpers dengan random token ke `MaintenanceService`.
