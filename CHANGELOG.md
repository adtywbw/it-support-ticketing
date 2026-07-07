# Changelog

Riwayat perubahan project yang dipindahkan dari `AGENTS.md` agar project memory tetap ringkas.

## Session 47 — Code Review Final Batch: CSRF, Device Fingerprint, File Safety, Restore Transaction (2026-07-06)

### Added
- **CSRF protection via `CsrfGuard`**: New global guard that checks `X-Requested-With: XMLHttpRequest` on all state-changing requests. Safe methods (GET, HEAD, OPTIONS) and exempt paths (`/auth/login`, `/auth/refresh`, `/auth/logout`, `/health`) bypass the check. Registered as the first `APP_GUARD` in `app.module.ts` — runs before `MaintenanceGuard` and `JwtAuthGuard`. (`common/guards/csrf.guard.ts` — NEW, `app.module.ts`)
- **Device fingerprint binding for refresh tokens**: On login, a SHA-256 hash of User-Agent + client IP is stored alongside the refresh token in Redis. On token refresh, the current fingerprint is compared; mismatch causes immediate token revocation. Legacy tokens (plain string, no JSON wrapper) are accepted for backward compatibility. (`auth.service.ts`, `auth.controller.ts`)

### Fixed (Critical)
- **`CommentsService.create()` saves files before DB transaction**: Previously, uploaded files were saved to disk (`storageService.save()`) BEFORE the Prisma transaction began. If the transaction failed (e.g., max attachments exceeded), the inner catch block cleaned up, but a crash between save-and-commit would leave orphaned files. **Restructured to save files INSIDE the transaction callback**, so both file writes and DB records succeed or fail atomically. (`comments.service.ts`)
- **No CSRF protection**: Cookie-based auth with no CSRF token or custom header check exposed state-changing endpoints to cross-origin request forgery. **Added `CsrfGuard`** (see Added above). (`common/guards/csrf.guard.ts` — NEW)

### Fixed (Important)
- **`UsersService.delete()` — token revocation after DB success**: Refresh tokens were revoked via an async `eventEmitter.emitAsync('user.deleted')` that could fail silently after the user was already deleted from the DB. **Moved `redisService.deleteByPattern('refresh:{id}:*')` to execute BEFORE `transactionDelete()`**, with the event emission kept as a secondary hook. (`users.service.ts`)
- **`AuthService` reads `process.env.JWT_SECRET!` in 4 places**: Centralised via `getJwtSecret()` in `jwt.config.ts`, used in `JwtModule` async factories. (`jwt.config.ts`)
- **CSV export sort fields differ from main query**: Extracted `ALLOWED_SORT_FIELDS` constant shared by `findAll()` and `exportCsvToResponse()`. (`tickets.service.ts`)
- **Restore backup `DROP SCHEMA` not in transaction**: The destructive `DROP SCHEMA ... CASCADE` was executed before the restore pipe, with no rollback if the pipe failed. **Wrapped in psql `BEGIN; ... COMMIT`** so a failed restore automatically rolls back the schema drop. (`maintenance.service.ts`)
- **Rate limit missing on file upload endpoints**: `POST /tickets/:id/attachments` and `POST /tickets/:id/comments` had no specific throttle. **Added `@Throttle({ limit: 5, ttl: 60000 })` to both.** (`attachments.controller.ts`, `comments.controller.ts`)
- **Module-level `_accessToken` dual source of truth**: Removed `let _accessToken` from `auth-store.ts`. All access now goes through `useAuthStore.getState().accessToken`. (`auth-store.ts`, `axios.ts`)
- **`useRestoreBackup()` missing `onSuccess`**: Added `onSuccess` handler that invalidates `['maintenance', 'backups']` and `['maintenance', 'mode']` queries. (`use-maintenance.ts`)
- **`downloadBackupFile()` no error handling**: Wrapped in `try/catch` with `toast.error()`. (`use-maintenance.ts`)
- **`useUsers()` hardcoded `includeInactive=true`**: Added `includeInactive` parameter (default `true` for backward compat) to the hook options. (`use-users.ts`)
- **SLA cron and `recalculateOpenTicketsForConfig()` can overlap**: `recalculateOpenTicketsForConfig()` now acquires the same Redis lock (`sla:check:lock`) as the `checkSLA()` cron, preventing concurrent writes to `slaDueAt`/`slaStatus`. (`sla.service.ts`)
- **`NotificationsService` marks duplicate notification on error**: `notified.add()` was incorrectly called in the catch block, suppressing requester notifications when the assignee notification failed. Removed — requester now always receives their notification when the assignee fails. (`notifications.service.ts`)
- **`DashboardService.buildEnumCounts()` silent on unknown enum values**: Added `Logger.warn()` when a DB value doesn't match any known enum variant. (`dashboard.service.ts`)
- **`CategoriesController.delete()` returns `{ message }`**: Changed to return `void` — consistent with `TicketsController.delete()` and the `TransformInterceptor` envelope. (`categories.controller.ts`)

### Fixed (Minor)
- **`AuthController` test expects 1-arg refresh call**: Updated test expectations for new `refresh(token, req)` signature. (`auth.controller.spec.ts`)
- **`SLA service` test mocks missing `setNx`/`eval`**: Tests that trigger recalculation now explicitly mock `setNx` to return `true` and `eval` to return `1`. (`sla.service.spec.ts`)
- **`MaintenanceService` spec uses `'sh'` for restore lookup**: Changed to `'bash'` matching the actual implementation. (`maintenance.service.spec.ts`)
- **`CommentsService` spec expects file cleanup on transaction reject**: Updated to match new behavior (files saved inside transaction, no cleanup needed when transaction rejects before file save). (`comments/__tests__/comments.service.spec.ts`)
- **CI pipeline missing `prisma generate`**: Added `npx prisma generate` step before `npm run build` in the backend job. (`ci.yml`)
- **Seed `existingTicket` check uses `findFirst`**: Changed to `findUnique({ where: { ticketNumber: 'TKT-001' } })` to avoid false negatives in development. (`seed.ts`)
- **Migration `ON UPDATE CASCADE` unnecessary**: Removed from FK constraints — UUID primary keys never change. (`20260706000001_add_cascade_delete/migration.sql`)
- **Nginx default server lacks access log**: Added `access_log` directive. (`nginx.conf`)
- **Notification store not reset on logout**: `useAuthStore.logout()` now dynamically imports `useNotificationStore` and calls `reset()`. (`auth-store.ts`)

### Files Changed (28 files, +299/-120 lines)
- `backend/src/common/guards/csrf.guard.ts` — NEW
- `backend/src/app.module.ts` — CsrfGuard registration
- `backend/src/common/config/jwt.config.ts` — getJwtSecret()
- `backend/src/auth/auth.service.ts` — device fingerprint, jwtSecret centralised
- `backend/src/auth/auth.controller.ts` — pass req to login/refresh
- `backend/src/auth/strategies/jwt.strategy.ts` — getJwtSecret()
- `backend/src/comments/comments.service.ts` — file save inside transaction
- `backend/src/comments/comments.controller.ts` — +@Throttle
- `backend/src/attachments/attachments.controller.ts` — +@Throttle
- `backend/src/tickets/tickets.service.ts` — ALLOWED_SORT_FIELDS
- `backend/src/sla/sla.service.ts` — shared lock for recalculate
- `backend/src/users/users.service.ts` — token revoke before DB delete
- `backend/src/common/guards/maintenance.guard.ts` — getJwtSecret()
- `backend/src/notifications/notifications.gateway.ts` — getJwtSecret()
- `backend/src/notifications/notifications.service.ts` — removed premature notified.add()
- `backend/src/dashboard/dashboard.service.ts` — +Logger.warn on unknown enum
- `backend/src/maintenance/maintenance.service.ts` — BEGIN/COMMIT for DROP SCHEMA
- `backend/src/categories/categories.controller.ts` — delete() returns void
- `backend/test/smoke.e2e.spec.ts` — X-Requested-With header, delete shape
- `backend/src/users/users.service.spec.ts` — +RedisService mock + token revoke test
- `backend/src/auth/auth.controller.spec.ts` — 2-arg refresh expectation
- `backend/src/sla/sla.service.spec.ts` — setNx/eval mocks
- `backend/src/maintenance/maintenance.service.spec.ts` — sh→bash
- `backend/src/comments/__tests__/comments.service.spec.ts` — updated cleanup test
- `backend/src/categories/__tests__/categories.controller.spec.ts` — expect undefined
- `frontend/src/stores/auth-store.ts` — removed _accessToken, +notification reset
- `frontend/src/lib/axios.ts` — use getState() instead of getAccessToken()
- `frontend/src/hooks/use-users.ts` — +includeInactive param
- `frontend/src/hooks/use-maintenance.ts` — +onSuccess for restore, +error handling for download
- `.github/workflows/ci.yml` — +prisma generate step
- `backend/prisma/seed.ts` — findUnique for ticketNumber check
- `backend/prisma/migrations/...add_cascade_delete/migration.sql` — removed ON UPDATE CASCADE
- `nginx/nginx.conf` — +access_log on default_server

### Verification (Session 47)
- Backend: build ✅, lint 0 errors ✅, tests 757/757 ✅ (72 suites)
- Backend E2E: 14/14 ✅ (9 CRUD + 5 maintenance mode)
- Frontend: build ✅, tests 221/221 ✅
- **`AuditService`**: Centralized structured event logging service in `common/services/`. Method `log(action, entity, entityId, userId, metadata?)` writes JSON via `Logger.log`. Method `logAndThrow()` logs then re-throws any `HttpException`. Zero Prisma dependency — easy to upgrade to DB-backed persistence later. (`common/services/audit.service.ts` — NEW, `common/services/services.module.ts` — NEW)
- **`AppThrottlerGuard`**: Custom rate-limit guard that uses `user:{id}` as the throttle key for authenticated requests instead of the raw client IP. Users behind the same NAT no longer share a single quota. Falls back to `ip:{addr}` for unauthenticated/public routes. Replaces the default `ThrottlerGuard` as an `APP_GUARD`. (`common/guards/app-throttler.guard.ts` — NEW)

### Fixed (Important)
- **E2E: 5 additional smoke tests**: Maintenance mode enable/disable via Admin, health check reflects maintenance state, exempt paths (auth) still work during maintenance. (`test/smoke.e2e.spec.ts`)
- **Login throttle too low (5/min)**: Raised to 20 requests per 60 seconds to accommodate E2E test suites without hitting 429. The account lockout (10 failed attempts) still prevents brute-force. (`auth.controller.ts`)

### Fixed (Minor)
- **Nginx rate limit on `/api/maintenance/` location**: Removed redundant `limit_req` — backend `@Throttle` already covers this path. (`nginx.ssl.conf`)

### Files Changed (9 files, +156/-4 lines)
- `backend/src/common/services/audit.service.ts` — NEW
- `backend/src/common/services/services.module.ts` — NEW
- `backend/src/common/guards/app-throttler.guard.ts` — NEW
- `backend/src/app.module.ts` — ServicesModule + AppThrottlerGuard
- `backend/src/auth/auth.controller.ts` — throttle 5→20
- `backend/test/smoke.e2e.spec.ts` — +5 maintenance mode tests
- `nginx/nginx.ssl.conf` — removed limit_req from maintenance location
- `AGENTS.md` — services, AppThrottlerGuard docs
- `ARCHITECTURE.md` — services/ + app-throttler.guard.ts

---

## Session 46 — Restore Pipefail Shell Fix (2026-07-06)

### Fixed (Critical)
- **`MaintenanceService.restoreDatabase()` uses `sh` instead of `bash` for pipefail pipeline**: The gzip→awk→psql restore pipeline called `execFileAsync('sh', ['-c', 'set -o pipefail && ...'])`. On Debian-based systems, `/bin/sh` is dash which does **not** support `set -o pipefail`, causing `sh: set: Illegal option -o pipefail`. This meant the entire restore command failed before any SQL was imported, but the preceding `DROP SCHEMA public CASCADE` had already succeeded, leaving the database empty (all tables dropped, no data restored). The `restoreBackup()` error handler then re-enabled maintenance mode with a recovery message, locking out all non-admin users. **Changed `'sh'` to `'bash'` in the `execFileAsync` call.** (`maintenance.service.ts`)

### Recovery Steps Applied
- Database manually restored from pre-restore backup `20260706-143253507` via `bash -c 'set -o pipefail && gzip -dc ... | psql ...'`
- Maintenance mode disabled by deleting `maintenance:enabled` and `maintenance:message` keys from Redis
- API container rebuilt and restarted
- Verified: health ✅, login 201 ✅, maintenance OFF ✅

### Changed
- **`AGENTS.md`**: Added note that `MaintenanceService.restoreDatabase()` uses `execFileAsync('bash', ...)` for pipefail support.
- **`ARCHITECTURE.md`**: Added DB restore shell requirement documentation.
- **`CHANGELOG.md`**: Added Session 46 entry.

### Verification
- Backend: build ✅, API container restart ✅, health check ✅, login 201 ✅
- Database: restored with 2 seed users (admin + support), all tables present

## Session 45 — Code Review Final: Category Toggle Fix, ESLint Cleanup, Service Consistency (2026-07-06)

### Fixed (Critical)
- **`UpdateCategoryDto` missing `isActive` field**: The `PartialType(CreateCategoryDto)` omitted `isActive`, so `whitelist: true` + `forbidNonWhitelisted` validation stripped the field from PATCH requests, making it impossible for Admin to activate/deactivate categories. **Added `@IsOptional() @IsBoolean() isActive?: boolean` to `UpdateCategoryDto`.** (`update-category.dto.ts`)
- **`DELETE /tickets/:id` returns 500 (Prisma FK violation)**: The `TicketsService.delete()` method created a terminal `TicketHistory` entry INSIDE the same transaction that deleted the ticket. Since `TicketHistory.ticketId` has a FK constraint to `tickets(id)` with `ON DELETE RESTRICT`, the `ticket.delete()` failed with `Foreign key constraint violated`. **Removed the terminal entry creation (audit trail is preserved via `eventEmitter.emit('ticket.deleted')` and server logs). Added `onDelete: Cascade` to Comment, Attachment, and TicketHistory FK relations. Created migration `20260706000001_add_cascade_delete`.** (`prisma/schema.prisma`, `tickets.service.ts`, `prisma/migrations/20260706000001_add_cascade_delete/migration.sql`)

### Fixed (Important)
- **`FaqsService` methods inconsistent without `async`**: `findActiveOrdered()`, `findAll()`, and `create()` returned Promises without `async` keyword, inconsistent with every other service method. **Added `async` to all three.** (`faqs.service.ts`)
- **Backend `eslint.config.js` triggers Node.js module-type warning**: The file uses `import`/`export` syntax but `package.json` has no `"type": "module"`. Node.js emits `MODULE_TYPELESS_PACKAGE_JSON` warning on every lint run. **Renamed to `eslint.config.mjs` to force ES module mode.** (`eslint.config.js` → `eslint.config.mjs`)

### Fixed (Build)
- **`frontend/Dockerfile` COPY fails for `.eslintrc.cjs`**: The Dockerfile tried to `COPY .eslintrc.cjs` and `.eslintignore`, but both files are excluded by `.dockerignore`, so Docker build failed with `COPY failed: file not found`. **Removed both COPY commands — they are not needed for the production build.** (`frontend/Dockerfile`)

### Changed
- **`AGENTS.md`**: Added note that the ESLint config is `eslint.config.mjs` (`.mjs` extension). Updated delete audit trail behavior.
- **`CHANGELOG.md`**: Added Session 45 entries.
- **`AGENTS.md` §Ticket Rules / `delete()`**: Updated to reflect that the terminal history entry is no longer created inside the ticket delete transaction. Deletion audit is captured via `eventEmitter.emit('ticket.deleted')` and server logs.
- **HTTPS**: Migrated from HTTP-only nginx to `docker-compose.prod.yml` with mkcert TLS. Nginx now serves HTTPS on port 443 with HTTP→301→HTTPS redirect.

### E2E Production Verification (Full Sweep)
- **11 migrations applied** ✅ (init → add_cascade_delete)
- **Seed data**: 4 users, 5 categories, 8 SLA configs ✅
- **FK constraints**: 3 relations ON DELETE CASCADE ✅
- **pg_trgm extension** + all indexes present ✅
- **File upload**: upload 201 ✅, download 200 ✅, invalid type rejected 400 ✅, oversized rejected 413 (Multer) ✅
- **CSV export**: Admin 200 ✅, EndUser 403 ✅
- **Rate limiting**: 5 rapid logins ok, 6th blocked 429 ✅
- **Account lockout**: 10 failed attempts → locked ✅
- **Error codes**: 400 ✅ 401 ✅ 403 ✅ 404 ✅ 409 ✅ 429 ✅
- **Maintenance mode**: enable 200 ✅, non-admin blocked 503 ✅, Admin still allowed 200 ✅, backup create/list/download/delete ✅, disable 200 ✅
- **Docker healthcheck**: healthy, simulate crash → auto-restart ✅
- **Container resources**: API 84MB / 1GB ✅, DB 81MB / 2GB ✅, nginx 24MB / 256MB ✅, Redis 8MB / 512MB ✅
- **API error logs**: zero ✅
- **Frontend**: index.html serves ✅, SPA routing 200 ✅, JS bundle 245KB gzipped ✅, CSS 57KB ✅, immutable cache headers ✅, CSP + security headers ✅
- **HTTPS**: certificate valid ✅, HTTP→301→HTTPS redirect ✅

### Verification
- Backend: build ✅, tests 72/72 suites ✅ (756/756 tests), lint 0 errors (238 warnings in test files)
- Frontend: build ✅, tests 221/221 ✅, lint 0 errors (26 test-only warnings)

## Session 44 — Comprehensive Code Review: Final Cleanup & 10/10 Rating (2026-07-06)

### Fixed (Critical)
- **`backend/docker-entrypoint.sh` shebang mismatch (`#!/bin/sh` + `pipefail`)**: The entrypoint used `#!/bin/sh` (Debian dash) but `set -o pipefail` is a bash extension. Dash ignores the option silently or errors depending on version. **Changed shebang to `#!/bin/bash`.** (`docker-entrypoint.sh`)

### Fixed (Important)
- **`UpdatePriorityDto` missing `@IsNotEmpty()` on enum field**: The `priority` field had `@IsEnum(Priority)` but no `@IsNotEmpty()`, inconsistent with `UpdateStatusDto` pattern. **Added `@IsNotEmpty()` decorator.** (`update-priority.dto.ts`)
- **`CreateSlaConfigDto` missing `@IsNotEmpty()` on enum field**: Same issue as above. **Added `@IsNotEmpty()`.** (`create-sla-config.dto.ts`)
- **Dead code: `RefreshDto` and `CreateAttachmentDto`**: `RefreshDto` was never used (refresh token read from cookie, not body). `CreateAttachmentDto` was never imported anywhere (attachments use `UploadAttachmentDto` + multipart upload). **Deleted both files and the `refresh.dto.spec.ts` test.** (3 files removed)
- **`maintenance.service.ts` Redis calls lack try/catch**: `setMaintenanceMode()` and `getMaintenanceMode()` called `redis.set()`/`redis.del()`/`redis.mget()` without error handling. A Redis outage would propagate non-HttpException 500 errors. **Wrapped in try/catch with `Logger.error()` and graceful fallback.** (`maintenance.service.ts`)
- **`AttachmentsController` download error returns non-standard `STREAM_ERROR` code**: The `STREAM_ERROR` code was not in the stable error codes list (`BAD_REQUEST`, `INTERNAL_ERROR`, etc). **Changed to `INTERNAL_ERROR`.** (`attachments.controller.ts`)
- **Frontend PasswordChangeSection dual error display**: `useChangePassword` hook had `onError` toast AND the component used `mutateAsync` with a try/catch that also showed errors. **Removed `onError` from hook; switched component from `mutateAsync` to `mutate` with callbacks.** (`use-change-password.ts`, `PasswordChangeSection.tsx`)
- **Frontend redundant Blob creation in CSV export**: `new Blob([response.data])` when `response.data` was already a Blob. **Changed to `response.data` directly.** (`TicketsPage.tsx`)
- **Frontend dead query invalidation key `['subcategories']`**: No query in the codebase uses this key. Sub-categories are embedded in the categories response. **Removed all `['subcategories']` invalidation calls.** (`MasterDataManagement.tsx`)
- **Backend ESLint `--ext .ts` flag deprecated in ESLint v10**: The `--ext` flag was removed in ESLint v9+ with flat config. **Changed to `eslint src`.** (`package.json`)
- **PostgreSQL missing `log_lock_waits`**: For a ticketing system with concurrent ticket updates, lock contention is likely. **Added `log_lock_waits = on`.** (`postgresql.conf`)
- **Docker cache service missing `cap_add`**: Had `cap_drop: ALL` but no `cap_add` entries (unlike nginx, frontend, db services). **Added `CHOWN`, `SETUID`, `SETGID` capabilities.** (`docker-compose.yml`)
- **Frontend Dockerfile shell-form CMD**: `CMD nginx -g 'daemon off;'` runs as `sh -c` and doesn't forward SIGTERM to nginx. **Changed to exec-form `CMD ["nginx", "-g", "daemon off;"]`.** (`frontend/Dockerfile`)
- **No CI/CD pipelines**: The `.github/` directory did not exist. **Added GitHub Actions workflow with backend (lint, test, build with PostgreSQL + Redis services) and frontend (lint, test, build) jobs.** (`.github/workflows/ci.yml`)

### Fixed (Minor)
- **`maintenance.service.ts` hardcoded Indonesian strings**: `System sedang dalam pemeliharaan` and `Restore gagal` messages were the only Indonesian strings in production code. **Changed to English throughout `maintenance.service.ts` and its test.** (2 files)
- **`.gitignore` missing IDE/editor patterns**: No entries for `.idea/`, `.vscode/`, `*.swp`, `*.swo`, `*~`, `.env.local`. **Added all patterns.** (`.gitignore`)
- **`.dockerignore` files too sparse**: Only excluded `node_modules`, `dist`, `.env`, `.git`. **Added `coverage`, `*.log`, `.gitignore`, `.eslintrc.cjs`, `.eslintignore`.** (2 files)
- **Frontend `.eslintignore` too sparse**: Only excluded `dist`. **Added `node_modules`, `coverage`, `*.log`.** (`.eslintignore`)
- **Frontend `.eslintrc.cjs` missing `react-hooks` plugin reference**: Added TODO comment to enable `plugin:react-hooks/recommended` once eslint-plugin-react-hooks is installed (can't install due to root-owned node_modules). (`.eslintrc.cjs`)

### Changed
- **`AGENTS.md`**: Updated to reflect session 44 changes. Added notes about the critical shebang fix, dead DTO removal, and CI/CD pipeline addition.
- **`CHANGELOG.md`**: Added Session 44 entry.

### Verification
- Backend: build ✅, tests 72/72 suites ✅ (756/756 tests), lint 0 errors
- Frontend: build ✅ (669ms), tests 221/221 ✅, lint 0 errors (26 test-only warnings)

## Session 43 — Code Review Final Round 4: WebSocket Origin Validation, CSP Sync, Memory Leaks (2026-07-06)

### Fixed (Important)
- **WebSocket origin validation missing (defense-in-depth)**: `NotificationsGateway` did not validate the `Origin` header during WebSocket connections, allowing potential cross-origin WebSocket hijacking. **Added `allowedOrigins` set initialized from `getCorsOrigins()` and Origin header check in `handleConnection()` that rejects unauthorized origins before JWT validation.** (`notifications.gateway.ts`)
- **Blob URL memory leak in `CommentSection`**: Preview blob URLs were not cleaned up on component unmount, and in-flight preview requests could set state on unmounted components. **Added `mountedRef` + `AbortController` pattern with proper cleanup in the unmount `useEffect`.** (`CommentSection.tsx`)
- **`UpdateStatusDto` missing `@IsNotEmpty()`**: The `status` field had `@IsEnum(TicketStatus)` but no `@IsNotEmpty()`, inconsistent with other DTOs. **Added `@IsNotEmpty()` decorator.** (`update-status.dto.ts`)
- **Double error display in `CreateTicketForm`**: Form-level `submitError` state duplicated the `toast.error()` from the mutation's `onError`, showing errors twice to the user. **Removed `submitError` state and let the mutation `onError` handle all error display; removed unused `getErrorMessage` import.** (`CreateTicketForm.tsx`)
- **Nginx CSP missing `ws: wss:` in `connect-src`**: The main `nginx.conf` and `nginx.ssl.conf` static asset locations had `connect-src 'self'` without `ws: wss:`, which can block Socket.IO WebSocket connections. **Synced CSP across all 3 nginx configs to consistently include `ws: wss:` in `connect-src`.** (`nginx.conf`, `nginx.ssl.conf`)
- **Gateway test mock missing `handshake.headers`**: Tests broke after adding origin validation because the mock socket lacked `handshake.headers`. **Added `headers: {}` to `makeMockSocket()`.** (`notifications.gateway.spec.ts`)

### Changed
- **`AGENTS.md`**: Added note about WebSocket Origin header validation in `NotificationsGateway`. Added note about `@IsNotEmpty()` on enum fields in DTOs.
- **`CHANGELOG.md`**: Added Session 43 entry.

### Files Changed
- `backend/src/notifications/notifications.gateway.ts` — Origin validation, duplicate constructor fix, `allowedOrigins` set
- `backend/src/notifications/__tests__/notifications.gateway.spec.ts` — `handshake.headers` in mock socket
- `backend/src/tickets/dto/update-status.dto.ts` — added `@IsNotEmpty()`
- `frontend/src/components/tickets/CommentSection.tsx` — `mountedRef`, `AbortController`, blob URL cleanup
- `frontend/src/components/tickets/CreateTicketForm.tsx` — removed `submitError` state, removed `getErrorMessage` import
- `nginx/nginx.conf` — added `ws: wss:` to CSP `connect-src` in all 3 location blocks
- `nginx/nginx.ssl.conf` — added `ws: wss:` to CSP `connect-src` in all 3 location blocks

### Verification
- Backend: build ✅, tests 760/760 ✅ (73 suites), lint 0 errors
- Frontend: build ✅ (656ms), tests 221/221 ✅, lint 0 errors (26 test-only warnings)

## Session 42 — Code Review Final Round 3: Redis Fail-Open, Mutation Error Handling, Nginx Hardening (2026-07-06)

### Fixed (Critical)
- **`AuthService.checkAccountLocked()` and `resetFailedLogin()` — Redis failure blocks all logins**: Both methods called `redisService.get()` / `redisService.del()` without try/catch. A transient Redis outage would throw an unhandled 500, preventing ALL users from logging in. **Added try/catch with `Logger.warn` that returns silently (fail-open) on Redis errors.** (`auth.service.ts`)
- **`CreateAttachmentDto.size` — zero validation decorators**: The `size` field had no `@IsInt()` or `@Min(0)` validation, allowing arbitrary values to pass. **Added both decorators.** (`create-attachment.dto.ts`)
- **27 frontend mutation hooks missing error handlers**: Silent failures across all mutation hooks — tickets, users, sla-configs, maintenance, telegram, notifications — left users with zero feedback when API calls failed. **Added `onError: toast.error(getErrorMessage(err, ...))` to every `useMutation`.** (7 hook files)
- **`TicketList` queryFilters object recreated every render**: The `queryFilters` object was constructed inline in the render body, creating a new reference on every render. TanStack Query deep-hashed the unstable key, but this pattern violates AGENTS.md guidance and risks infinite refetch loops if any value is non-primitive. **Wrapped in `useMemo`.** (`TicketList.tsx`)

### Fixed (Important)
- **`MaintenanceController` redundant `JwtAuthGuard` on 7 endpoints**: Despite being a global `APP_GUARD`, 7 maintenance endpoints had `@UseGuards(JwtAuthGuard, RolesGuard)`, double-verifying every JWT. **Removed `JwtAuthGuard` from all 7; kept only `@UseGuards(RolesGuard)`.** (`maintenance.controller.ts`)
- **Unused `JwtAuthGuard` imports**: `sla.controller.ts` and `auth.controller.ts` imported `JwtAuthGuard` but never referenced it. **Removed.** (`sla.controller.ts`, `auth.controller.ts`)
- **`RedisService` core methods lacked error handling**: Methods `set`, `get`, `del`, `incr`, `eval`, `deleteByPattern`, etc. delegated directly to ioredis without try/catch or logging, making Redis failures invisible in logs. **Added `Logger` + try/catch with `Logger.error()` to all core methods.** (`redis.service.ts`)
- **`FaqRepository` methods missing `async`**: All 6 methods returned Prisma promises without `async` keyword, creating inconsistency with every other repository. **Added `async` to all methods.** (`faq.repository.ts`)
- **Missing rate limiting on `logout` and `change-password`**: The `logout` endpoint (public, unauthenticated) and `change-password` (restricted to Admin/ITSupport) had no rate limiting. **Added `@Throttle({ default: { limit: 5, ttl: 60000 } })` to both.** (`auth.controller.ts`)
- **`Modal` Escape handler re-registers listener on every `onClose` change**: The `useCallback` depended on `onClose`, causing the `keydown` event listener to be removed and re-added every time the parent passed a new `onClose` reference. **Added `useRef(onClose)` with stable `useCallback` (empty deps).** (`Modal.tsx`)
- **`NotificationsPage` mark-as-read click had no error handling**: Clicking an unread notification called `markAsRead.mutate(notif.id)` without `onError`, so failures silently left the notification unread in the UI. **Added `onError: toast.error(...)` to the `mutate()` call.** (`NotificationsPage.tsx`)
- **Hardcoded Indonesian maintenance message**: `AdminMaintenancePage` had `'System sedang dalam pemeliharaan...'` — the only Indonesian string in production code. **Changed to English.** (`AdminMaintenancePage.tsx`)
- **Nginx hardening**: `nginx.conf` — added `server_tokens off`, WebSocket rate limit zone (`ws_limit`), and rate limiting on `/socket.io/`. `nginx.ssl.conf` — added `server_tokens off`. `frontend/nginx.conf` — added `server_tokens off` and `object-src 'none'` to CSP. (3 nginx config files)
- **Docker compose missing `pids_limit`**: `nginx`, `db`, and `cache` services lacked `pids_limit: 256`. **Added.** (`docker-compose.yml`)
- **PostgreSQL missing slow query logging**: `postgresql.conf` had no `log_min_duration_statement`. **Added `log_min_duration_statement = 1000`, `log_connections = on`, `log_disconnections = on`.** (`postgres/postgresql.conf`)
- **`docker-entrypoint.sh` missing `set -o pipefail`**: Only `set -e` was present. **Added `-o pipefail`.** (`docker-entrypoint.sh`)

### Fixed (Minor)
- **Unnecessary type assertions in `TicketRepository`**: Removed `as Prisma.TicketWhereInput` cast on `where` clause (already typed) and 3 `as DashboardTicketSummary[]` casts on attention ticket arrays. (`ticket.repository.ts`)

### Changed
- **`AGENTS.md`**: Updated session reference (40 → 42) for `as any` casts section. Added 7 new Common Pitfalls covering mutation error handlers, ProtectedRoute `useRef` pattern, Modal Escape handler, queryFilters `useMemo`, Redis service error handling, auth fail-open, DTO numeric validation, faq repo async, and nginx hardening rules.
- **`CHANGELOG.md`**: Added Session 42 entry.

### Files Changed
- `backend/src/auth/auth.service.ts` — try/catch on checkAccountLocked + resetFailedLogin
- `backend/src/auth/auth.controller.ts` — removed unused JwtAuthGuard import, added @Throttle to logout + change-password
- `backend/src/attachments/dto/create-attachment.dto.ts` — @IsInt() @Min(0) on size
- `backend/src/maintenance/maintenance.controller.ts` — removed redundant JwtAuthGuard from 7 endpoints
- `backend/src/sla/sla.controller.ts` — removed unused JwtAuthGuard import
- `backend/src/redis/redis.service.ts` — Logger + try/catch on all core methods
- `backend/src/common/repositories/faq.repository.ts` — async keywords
- `backend/src/common/repositories/ticket.repository.ts` — removed unnecessary casts
- `backend/docker-entrypoint.sh` — set -eo pipefail
- `frontend/src/hooks/use-tickets.ts` — onError on all 7 mutations
- `frontend/src/hooks/use-users.ts` — onError on all 3 mutations
- `frontend/src/hooks/use-sla-configs.ts` — onError on both mutations
- `frontend/src/hooks/use-maintenance.ts` — onError on all 4 mutations
- `frontend/src/hooks/use-telegram.ts` — onError on all 6 mutations
- `frontend/src/hooks/use-notifications.ts` — onError on all 3 mutations
- `frontend/src/hooks/use-notification-preferences.ts` — onError on mutation
- `frontend/src/components/tickets/TicketList.tsx` — useMemo for queryFilters + useRef for onPageChange
- `frontend/src/components/ui/Modal.tsx` — useRef(onClose) for Escape handler
- `frontend/src/pages/AdminMaintenancePage.tsx` — English maintenance message
- `frontend/src/pages/NotificationsPage.tsx` — onError on mark-as-read click
- `frontend/src/pages/__tests__/AdminMaintenancePage.test.tsx` — updated test expectation
- `nginx/nginx.conf` — server_tokens off, ws_limit zone, /socket.io/ rate limit
- `nginx/nginx.ssl.conf` — server_tokens off
- `frontend/nginx.conf` — server_tokens off, object-src 'none' in CSP
- `docker-compose.yml` — pids_limit on nginx, db, cache
- `postgres/postgresql.conf` — slow query logging + connection audit

### Fixed (Minor Round 2 — 10/10 cleanup)
- **`MaintenanceService.acquireLock()` bypassed RedisService abstraction**: Used `this.redis.getClient().set(key, token, 'EX', ttl, 'NX')` instead of the existing `this.redis.setNx(key, token, ttl)`. **Replaced with `setNx`; removed now-unused `RedisService.getClient()`.** (`maintenance.service.ts`, `redis.service.ts`)
- **`NotificationsGateway` lacks per-user connection limit**: No max connections per userId, allowing a single user to open unbounded concurrent WebSocket connections. **Added `MAX_CONNECTIONS_PER_USER = 5` limit enforced in `handleConnection()`.** (`notifications.gateway.ts`)
- **`TicketsService.updateStatus()` fragile context mutation pattern**: Used external `context` object + non-null assertions (`!`) to pass data out of a transaction callback. **Replaced with typed return value from the transaction.** (`tickets.service.ts`)
- **`NotificationsService` event handlers lack per-create error handling**: If `this.create()` failed for one user in a batch, the error propagated and stopped processing for remaining users. **Added try/catch with `Logger.error()` around each individual `create()` call in all event handlers.** (`notifications.service.ts`)
- **`useNotifications()` missing staleTime**: Inherited global `staleTime: 0`, refetching on every mount/focus. **Added `staleTime: STALE_TIME_NOTIFICATION_DROPDOWN` (30s).** (`use-notifications.ts`)
- **`Pagination.getPages()` produces invalid output for `totalPages <= 0`**: The function returned `[1, '...', 1]` for `totalPages=0`. **Added early return for `totalPages <= 0`.** (`Pagination.tsx`)

### Changed
- `AGENTS.md` — Updated `redis.service.ts` entry to note `getClient()` was removed. Added note about WebSocket connection rate limiting (5 per user).
- `CHANGELOG.md` — Added Session 42 Round 2 entry.

### Verification (Round 2)
- Backend: build ✅, tests 760/760 ✅ (73 suites), lint 0 errors
- Frontend: build ✅ (679ms), tests 221/221 ✅ (44 suites), lint 0 errors (26 test-only warnings)

## Session 41 — Code Review Final Round 2: Role Guard Enforcement, CSP Hardening, Dashboard Invalidation (2026-07-06)

### Fixed (Critical)
- **`POST /api/auth/change-password` — missing `@UseGuards(RolesGuard)`**: The `@Roles(Role.ITSupport, Role.Admin)` decorator was set but `RolesGuard` was never applied, allowing any authenticated user (including EndUser) to call this endpoint. Per AGENTS.md, `changePassword` is restricted to ITSupport & Admin. **Added `@UseGuards(RolesGuard)`.** (`auth.controller.ts`)
- **Redundant `@UseGuards(JwtAuthGuard)` on 2 remaining controllers**: `DashboardController` and `UsersController` had duplicate `JwtAuthGuard` at class level despite it being a global `APP_GUARD`. Session 40 cleaned 9 other controllers but missed these 2. **Removed.** (`dashboard.controller.ts`, `users.controller.ts`)
- **Nginx CSP `ws: wss:` on static asset locations**: All static location blocks (`/assets/`, `/index.html`, `/`) in both `nginx.conf` and `nginx.ssl.conf` included `ws: wss:` in `connect-src`, which has no business on static file serving. **Removed from all 6 occurrences.** (`nginx.conf`, `nginx.ssl.conf`)

### Fixed (Important)
- **`CategoryRepository.findAll()` missing `slaConfigs` for Admin**: The `findAll()` method omitted `slaConfigs` from the include, contradicting the documented contract that Admin gets full data including `slaConfigs`. **Added `slaConfigs` + expanded `_count` to cover all relations.** (`category.repository.ts`)
- **`SubCategoryRepository.findByCategoryId()` hardcoded `isActive: true`**: Admin could not see inactive sub-categories from the Master Data page, preventing reactivation. **Added optional `includeInactive` parameter; service passes `role === 'Admin'`.** (`sub-category.repository.ts`, `sub-categories.controller.ts`, `sub-categories.service.ts`)
- **`AuthService.revokeRefreshToken()` — no error handling on Redis `del()`**: Redis failure during token revocation silently left tokens valid. **Added try/catch with `Logger.warn`.** (`auth.service.ts`)
- **`MaintenanceService.setMaintenanceMode(false)` — unchecked Redis error**: The `RESTORE_LOCK_KEY` `get()` call could throw non-HttpException if Redis was unreachable. **Added try/catch with BadRequestException pass-through.** (`maintenance.service.ts`)
- **Dashboard query key object reference instability**: `useDashboardStats(query)` used `['dashboard', 'stats', query]` where `query` is an object reference, causing infinite refetch loops on inline calls. **Added `serializeQuery()` for stable string keys.** (`use-dashboard.ts`)
- **Dashboard invalidation used wrong key in 6 mutation hooks**: Mutations invalidated `['dashboard']` instead of the actual query key `['dashboard', 'stats']`. **Fixed across `use-tickets.ts` (5 mutations) and `use-sla-configs.ts` (2 mutations).**
- **`useTicket()` missing staleTime**: Single ticket query inherited global `staleTime: 0`, refetching on every mount/focus. **Added `staleTime: STALE_TIME_TICKETS`.** (`use-tickets.ts`)
- **`useChangePassword()` missing error handler**: Mutation failures were silently swallowed. **Added `toast.error()` via `onError`.** (`use-change-password.ts`)
- **`useFileUpload()` blob URL leak on unmount**: Existing entries' blob URLs were not revoked when the consuming component unmounted. **Added `useEffect` cleanup using ref.** (`use-file-upload.ts`)
- **`AttachmentList` division by zero risk**: `Math.ceil(attachMeta.total / attachLimit)` with no zero guard on `attachLimit`. **Added `|| 1` in both pagination computation locations.** (`AttachmentList.tsx`)

### Fixed (Minor)
- **Unused `logout(userId, tokenId)` method in `AuthService`**: Dead code that was never called. **Removed.** (`auth.service.ts`)
- **`useTickets.ts` `value !== 0` filter**: Overly broad filter could silently drop valid `0` values from query params. **Removed condition.** (`use-tickets.ts`)

### Changed
- **`CategoryRepository.findAll()`**: Signature changed from `findAll()` to `findAll(includeInactive?: boolean)`. When `true` (Admin), includes SLA configs and does not filter sub-categories by `isActive`. Non-Admin callers pass `false` or omit the parameter.
- **`SubCategoryRepository.findByCategoryId()`**: Signature changed from `findByCategoryId(categoryId)` to `findByCategoryId(categoryId, includeInactive?: boolean)`. Defaults to `isActive: true` filter when `includeInactive` is falsy.
- **`AuthService.logout()`**: Removed unused `logout(userId, tokenId)` method. The controller already calls `revokeRefreshToken()` directly.
- **`use-dashboard.ts`**: Query key serialized with `serializeQuery()` to prevent object-reference instability. No behavioral change for consumers.
- **`frontend/package.json`**: Removed `--max-warnings 0` from lint script. All 26 warnings are in test files (`no-explicit-any` for mock variables) and should not block CI.

### Files Changed
- `backend/src/auth/auth.controller.ts` — added `@UseGuards(RolesGuard)` on changePassword
- `backend/src/auth/auth.service.ts` — try/catch on revokeRefreshToken, removed logout dead code, added Logger
- `backend/src/common/repositories/category.repository.ts` — `findAll(includeInactive?)` with slaConfigs + expanded _count
- `backend/src/common/repositories/__tests__/category.repository.spec.ts` — updated for new findAll + findByCategoryId signatures
- `backend/src/common/repositories/sub-category.repository.ts` — `findByCategoryId(categoryId, includeInactive?)`
- `backend/src/categories/categories.service.ts` — passes `true` to findAll for Admin
- `backend/src/dashboard/dashboard.controller.ts` — removed redundant `JwtAuthGuard`
- `backend/src/maintenance/maintenance.service.ts` — try/catch on setMaintenanceMode Redis get
- `backend/src/sub-categories/sub-categories.controller.ts` — passes `@CurrentUser('role')` to service
- `backend/src/sub-categories/sub-categories.controller.spec.ts` — updated test to pass role arg
- `backend/src/sub-categories/sub-categories.service.ts` — passes includeInactive based on role
- `backend/src/users/users.controller.ts` — removed redundant `JwtAuthGuard`
- `frontend/package.json` — removed `--max-warnings 0`
- `frontend/src/components/tickets/AttachmentList.tsx` — division by zero guard
- `frontend/src/hooks/use-change-password.ts` — added onError with toast
- `frontend/src/hooks/use-dashboard.ts` — serializeQuery for stable keys
- `frontend/src/hooks/use-file-upload.ts` — blob URL cleanup on unmount
- `frontend/src/hooks/use-sla-configs.ts` — dashboard stats invalidation
- `frontend/src/hooks/use-tickets.ts` — removed `value !== 0`, added staleTime, fixed dashboard invalidation keys
- `nginx/nginx.conf` — removed `ws: wss:` from static CSP blocks
- `nginx/nginx.ssl.conf` — removed `ws: wss:` from static CSP blocks

### Verification
- Backend: build ✅, tests 760/760 ✅, lint 0 errors
- Frontend: build ✅ (717ms), tests 221/221 ✅, lint 0 errors

### Fixed (Critical)
- **Missing rate limit on `POST /api/auth/refresh`**: Refresh endpoint had no specific throttle, exposing it to brute-force of leaked refresh tokens. Added `@Throttle({ default: { limit: 5, ttl: 60000 } })` matching the login endpoint. (`auth.controller.ts`)
- **`useFileUpload` preview URL sync bug**: Blob URLs were created in a deferred `useEffect` but consumed in a `useMemo` that ran before the effect, causing previews to be one render behind and briefly showing broken `<img src="">`. Rewrote hook to create blob URLs **synchronously** in `createFilePreview()` factory, storing them in state alongside files. Removed the `useRef`/`useEffect`/`useMemo` dance entirely. (`use-file-upload.ts`)
- **Telegram bot token leak in error messages**: `replaceAll(token, '<token>')` missed percent-encoded URLs and only redacted the raw token string. Replaced with regex-based redaction that escapes regex special chars AND strips the full `https://api.telegram.org/bot<token>` API URL pattern. (`telegram.service.ts`)

### Fixed (Important)
- **`as unknown as` casts in `AttachmentRepository` and `SubCategoryRepository`**: Both repositories used `as unknown as Prisma.GetPayload<T>` casts, bypassing TypeScript safety (contradicting AGENTS.md §Session 36 which claimed all such casts were removed). Replaced with proper `Prisma.GetPayload<>` annotations at call sites. Added `Prisma` import to `sub-categories.service.ts`. (`attachment.repository.ts`, `sub-category.repository.ts`, `attachments.service.ts`, `sub-categories.service.ts`)
- **Duplicate `trimString` in 5 DTO files**: `create-user.dto.ts`, `create-faq.dto.ts`, `create-sub-category.dto.ts`, `create-category.dto.ts`, and `restore-backup.dto.ts` each defined an identical local `trimString` function. Extracted `trimOptionalString` to shared `transform.util.ts` and imported from there. (`transform.util.ts`, 5 DTO files)
- **Redundant `@UseGuards(JwtAuthGuard)` on 9 controllers**: `JwtAuthGuard` is a global `APP_GUARD` in `app.module.ts`, yet 9 controllers duplicated `@UseGuards(JwtAuthGuard)` at class level, creating a redundant guard instance that double-verified every JWT. Removed and cleaned up unused imports. (9 controller files)
- **Unsafe type assertion in CSV export loop**: `batch as Array<{...}>` bypassed TypeScript safety. Defined explicit `CsvExportTicket` interface and typed the cast against it. (`tickets.service.ts`)
- **`isEventEnabled()` returned `true` for arrays**: Malformed `notificationPreferences` arrays were treated as "all events enabled" instead of invalid. Added explicit `undefined` check. (`notification-preference.util.ts`)
- **Navbar unsafe type cast + missing error handlers**: `notif.data` was cast `as Record<string, string>` without type narrowing. Mutations (`clearAll`, `markAllAsRead`, `handleNotificationClick`) lacked `onError` handlers. Notifications dropdown query had no error state. Fixed with proper narrowing, `toast.error()` handlers, and error state display. (`Navbar.tsx`)
- **TicketFilters selects missing `aria-label`**: 5 `<select>` filters and 2 custom date inputs had no accessible labels. Added `aria-label` attributes. (`TicketFilters.tsx`)
- **TicketList mutation `onError` calls `refetch()`**: Priority and assign mutations called `refetch()` inside `onError`, creating a rapid retry loop on server degradation. Removed `refetch()` — list is invalidated on mutation success anyway. (`TicketList.tsx`)
- **Frontend container lacks security hardening**: Unlike all other services, the `frontend` service had no `mem_limit`, `cpus`, `pids_limit`, `cap_drop`, `read_only`, `security_opt`, or `tmpfs`. Added matching hardening. (`docker-compose.yml`)

### Fixed (Minor)
- **Hardcoded Indonesian maintenance messages**: Backend `maintenance.guard.ts` and frontend `MaintenanceBanner.tsx` had Indonesian fallback messages (`System sedang dalam pemeliharaan`). Changed to English. (`maintenance.guard.ts`, `MaintenanceBanner.tsx`)
- **Missing runtime `JWT_SECRET` validation**: `jwt.config.ts` used `process.env.JWT_SECRET!` with no runtime check — a missing env var would produce the string `"undefined"` as the secret. Added startup validation requiring ≥32 chars. (`jwt.config.ts`)
- **`users.service.ts` `as unknown as` cast for reactivated user**: Replaced with typed intersection type `ReactivatedUser`. (`users.service.ts`)
- **`docker-entrypoint.sh` uses `npx --no-install`**: If the local prisma binary is absent, `--no-install` would fail the migration retry loop. Changed to `node node_modules/.bin/prisma`. (`docker-entrypoint.sh`)

### Changed
- **`useFileUpload` hook internals**: The hook no longer uses `useRef` or `useEffect` for blob URL management. Blob URLs are created synchronously on file add and stored in state. Consumers of the `previewUrls` return value are unaffected. (`use-file-upload.ts`)
- **`transform.util.ts`**: New export `trimOptionalString` for optional string fields that should be `undefined` on blank input.
- **`jwt.config.ts`**: Startup now requires `JWT_SECRET` to be set and ≥32 characters. Previously, a missing secret would silently use the string `"undefined"`.

### Files Changed
- `backend/src/auth/auth.controller.ts` — added `@Throttle` to refresh
- `backend/src/common/config/jwt.config.ts` — runtime JWT_SECRET validation
- `backend/src/common/guards/maintenance.guard.ts` — English message
- `backend/src/common/repositories/attachment.repository.ts` — removed `as unknown as`
- `backend/src/common/repositories/sub-category.repository.ts` — removed `as unknown as`
- `backend/src/common/utils/notification-preference.util.ts` — array handling
- `backend/src/common/utils/transform.util.ts` — added `trimOptionalString`
- `backend/src/telegram/telegram.service.ts` — regex token redaction
- `backend/src/tickets/tickets.service.ts` — `CsvExportTicket` interface
- `backend/src/users/users.service.ts` — `ReactivatedUser` type
- `backend/src/sub-categories/sub-categories.service.ts` — explicit payload type + Prisma import
- `backend/src/attachments/attachments.service.ts` — explicit payload type
- `backend/src/users/dto/create-user.dto.ts` — import `trimString`
- `backend/src/faqs/dto/create-faq.dto.ts` — import `trimString`
- `backend/src/sub-categories/dto/create-sub-category.dto.ts` — import `trimString`
- `backend/src/categories/dto/create-category.dto.ts` — import `trimString`
- `backend/src/maintenance/dto/restore-backup.dto.ts` — import `trimString`
- `backend/src/faqs/faqs.controller.ts` — removed redundant `@UseGuards(JwtAuthGuard)`
- `backend/src/tickets/tickets.controller.ts` — removed redundant `@UseGuards(JwtAuthGuard)`
- `backend/src/categories/categories.controller.ts` — removed redundant `@UseGuards(JwtAuthGuard)`
- `backend/src/comments/comments.controller.ts` — removed redundant `@UseGuards(JwtAuthGuard)` + `UseGuards`
- `backend/src/telegram/telegram.controller.ts` — removed redundant `@UseGuards(JwtAuthGuard)`
- `backend/src/sub-categories/sub-categories.controller.ts` — removed redundant `@UseGuards(JwtAuthGuard)`
- `backend/src/attachments/attachments.controller.ts` — removed redundant `@UseGuards(JwtAuthGuard)` + `UseGuards`
- `backend/src/sla/sla.controller.ts` — removed redundant `@UseGuards(JwtAuthGuard)`
- `backend/src/notifications/notifications.controller.ts` — removed redundant `@UseGuards(JwtAuthGuard)` + `UseGuards`
- `backend/docker-entrypoint.sh` — `npx --no-install` → `node node_modules/.bin/prisma`
- `frontend/src/hooks/use-file-upload.ts` — synchronous blob URLs
- `frontend/src/layout/Navbar.tsx` — safe types, error handlers, error state
- `frontend/src/components/tickets/TicketFilters.tsx` — `aria-label` attributes
- `frontend/src/components/tickets/TicketList.tsx` — removed `refetch()` from `onError`
- `frontend/src/components/MaintenanceBanner.tsx` — English messages
- `docker-compose.yml` — frontend resource constraints

### Verification
- Backend: build ✅, tests 757/757 ✅, TS no errors ✅, lint 0 errors
- Frontend: build ✅, tests 221/221 ✅, TS no errors ✅, lint 0 errors

## Session 39 — Code Review Fix Round 6: Audit Trail, Export Resilience, Frontend Stability (2026-07-06)

### Fixed (Critical)
- **Ticket deletion destroys all audit history**: `TicketsService.delete()` previously deleted all `TicketHistory` records before removing the ticket, leaving zero forensic trace. Now creates a terminal `TicketHistory` entry (`field: "status"`, `newValue: "Deleted"`) recording who deleted it and when, then deletes only comments, attachments, and the ticket. The controller now passes `@CurrentUser('id')` to `delete()`. (`tickets.service.ts`, `tickets.controller.ts`)

### Fixed (Important)
- **CSV export lacks rate limit**: `GET /api/tickets/export/csv` had no specific throttle, only the 10 req/s global. Added `@Throttle({ limit: 2, ttl: 60000 })` — max 2 exports per minute. (`tickets.controller.ts`)
- **CSV export unhandled stream errors on client disconnect**: `res.write()` could throw when the client disconnects mid-stream. Added `res.on('error'|'close')` listeners that set an `aborted` flag; the streaming loop and row-writing both check the flag and exit early. `res.end()` in the finalizer is guarded with `!res.writableEnded`. (`tickets.service.ts`)
- **Frontend pagination re-render loop**: `TicketList`'s `useEffect` depended on `onPageChange` directly. If the parent passed an inline callback, the effect ran on every render, potentially causing loops. Wrapped in `useRef` to decouple from callback identity. (`TicketList.tsx`)
- **ErrorBoundary lacks end-user guidance**: The error fallback showed only "try refreshing". Added "contact the helpdesk team if the issue persists" so non-technical users know next steps. (`ErrorBoundary.tsx`)

### Fixed (Minor)
- **Docker entrypoint chowns uploads on every restart**: `docker-entrypoint.sh` ran `chown -R node:node /app/uploads` unconditionally on each container start. Added a `stat`-based owner check to skip the recursive walk when permissions are already correct. (`docker-entrypoint.sh`)
- **Telegram `handleUpdate` typed with `any`**: Changed to a minimal typed interface for the Telegram update payload. (`telegram.service.ts`)

### Changed
- **`TicketsService.delete()`**: Signature changed from `delete(id: string)` to `delete(id: string, deletedBy?: string)`. The `deletedBy` parameter records who performed the deletion in the preserved audit trail history entry.
- **`TicketsController.delete()`**: Now accepts `@CurrentUser('id') userId` and passes it to `TicketsService.delete()`.
- **`docker-entrypoint.sh`**: Startup chown is now conditional — only runs when the current directory owner differs from the `node` user.

### Files Changed
- `backend/src/tickets/tickets.service.ts` — audit trail preservation, CSV stream abort handling
- `backend/src/tickets/tickets.controller.ts` — `@CurrentUser('id')` on delete, `@Throttle()` on CSV export
- `backend/src/tickets/tickets.service.spec.ts` — mock response has `on()` + `writableEnded`
- `backend/src/tickets/tickets.controller.spec.ts` — passes userId to delete
- `backend/src/telegram/telegram.service.ts` — typed `handleUpdate` instead of `any`
- `backend/docker-entrypoint.sh` — conditional chown via stat owner check
- `frontend/src/components/tickets/TicketList.tsx` — useRef for onPageChange callback
- `frontend/src/components/ui/ErrorBoundary.tsx` — contact support guidance text

### Verification
- Backend: build ✅, tests 757/757 ✅, lint 0 errors
- Frontend: build ✅, tests 221/221 ✅, lint 0 errors

## Session 38 — Code Review Implementation: 14 Issues Fixed (2026-07-06)

### Fixed (Critical)
- **Dynamic `import('fs')` in download hot path**: `AttachmentsController.download()` used `(await import('fs')).createReadStream(...)` on every file download, adding ~1-5ms latency. Fixed with static `import { createReadStream } from 'fs'`.
- **Orphaned file accumulation on process crash**: Files were saved to disk before DB transaction commit. Added `@Cron('0 */6 * * *') cleanupOrphanedFiles()` in `AttachmentsService` that cross-references filesystem against DB records and removes unmatched files. Added `AttachmentRepository.findAllPaths()`.

### Fixed (Important)
- **Redundant `JwtAuthGuard` provider**: `app.module.ts` had `JwtAuthGuard` created via `useFactory` AND registered as standalone provider. Removed the duplicate.
- **`sortBy` lacks boundary validation**: `QueryTicketDto.sortBy` used `@IsString()` instead of `@IsIn([...])`. Replaced with explicit allowlist matching the service's `allowedSortFields`.
- **SLA check redundant joins per batch**: `performSLACheck()` included `category.slaConfigs` for every ticket in each batch. Pre-loads active SLA configs into `Map<categoryId, config[]>` via new `SlaConfigRepository.findAllActive()`. Changed ticket query from `include` to minimal `select`.
- **EndUser ticket list 2 extra DB queries**: `TicketsService.findAll()` performed `countPublicCommentsByTicketIds` + `countVisibleAttachmentsByTicketIds` after the main query for EndUser. Moved filtered `_count` into the main query using Prisma's `_count.select.{comments,attachments}.where` — removed enrichment loop entirely.
- **Raw `<p>` error elements instead of `<ErrorMessage>`**: `CommentSection.tsx` and `AttachmentList.tsx` used inline `<p className="text-red-600">` for error states. Replaced with reusable `<ErrorMessage>` component.
- **Duplicate file upload logic in 3 components**: `CreateTicketForm`, `CommentSection`, and `AttachmentList` each independently implemented MIME validation, size checks, preview URLs, and error state management. Extracted shared `useFileUpload()` hook to `hooks/use-file-upload.ts`.

### Fixed (Minor)
- **Inline spinner in `ProtectedRoute`**: Replaced raw spinner `div` with `<LoadingSpinner size="lg" />`.
- **Telegram config catch uses generic message**: `TelegramConfigSection.handleCheck` catch block now uses `getErrorMessage(err, 'Failed to check configuration')`.
- **Redundant guards on change-password**: Removed `@UseGuards(JwtAuthGuard, RolesGuard)` from `AuthController.changePassword()` — both are already global.
- **`AdminMaintenancePage` too large (347 lines)**: Extracted backup management into `components/admin/BackupManager.tsx`. Page reduced to 72 lines.
- **SLA tests not updated for pre-load optimization**: Updated `sla.service.spec.ts` mocks and `makeTicket` helper to match new flat `select` query + pre-loaded config map.
- **`AttachmentRepository` missing path query**: Added `findAllPaths()` method for cleanup cron.

### Changed
- **`SLAService.performSLACheck()`**: Changed from nested `include.category.slaConfigs` per batch to pre-loaded config map + flat `select` on tickets. Eliminates N+1 join on category tables.
- **`TicketsService.findAll()`**: `include` object now conditional on role. EndUser gets filtered `_count` with visibility filters; other roles get unfiltered counts. Removes 2 post-query enrichment queries.
- **`AttachmentsService`**: Now has `cleanupOrphanedFiles()` with `@Cron('0 */6 * * *')` for periodic stale-file removal. Uses `Logger` for audit trail.
- **`SlaConfigRepository`**: Added `findAllActive()` returning minimal `{ categoryId, priority, resolutionTimeMinutes }` for active configs.
- **`AdminMaintenancePage.tsx`**: Decomposed — backup UI extracted to `BackupManager.tsx`. Page layout shell + maintenance mode toggle remain.
- **`CreateTicketForm`/`CommentSection`/`AttachmentList`**: File selection, validation, preview URL management extracted to shared `useFileUpload()` hook.

### Files Changed
- `backend/src/attachments/attachments.controller.ts` — static fs import, removed dynamic import
- `backend/src/attachments/attachments.service.ts` — NEW `cleanupOrphanedFiles()` + Logger
- `backend/src/common/repositories/attachment.repository.ts` — NEW `findAllPaths()`
- `backend/src/common/repositories/sla-config.repository.ts` — NEW `findAllActive()`
- `backend/src/app.module.ts` — removed redundant `JwtAuthGuard` provider
- `backend/src/auth/auth.controller.ts` — removed redundant guards on change-password
- `backend/src/tickets/dto/query-ticket.dto.ts` — `@IsIn()` on sortBy
- `backend/src/tickets/tickets.service.ts` — conditional role-based `_count`, removed enrichment loop
- `backend/src/sla/sla.service.ts` — pre-loaded config map, flat ticket select
- `backend/src/sla/sla.service.spec.ts` — updated mocks for new SLA check implementation
- `frontend/src/hooks/use-file-upload.ts` — NEW shared file upload hook
- `frontend/src/components/admin/BackupManager.tsx` — NEW extracted from AdminMaintenancePage
- `frontend/src/pages/AdminMaintenancePage.tsx` — 347→72 lines, uses `<BackupManager />`
- `frontend/src/components/tickets/CreateTicketForm.tsx` — uses `useFileUpload`
- `frontend/src/components/tickets/CommentSection.tsx` — uses `useFileUpload` + `<ErrorMessage>`
- `frontend/src/components/tickets/AttachmentList.tsx` — uses `useFileUpload` + `<ErrorMessage>`
- `frontend/src/auth/ProtectedRoute.tsx` — uses `<LoadingSpinner />`
- `frontend/src/components/account/TelegramConfigSection.tsx` — `getErrorMessage` in catch

### Verification
- Backend: build ✅, tests 757/757 ✅, lint 0 errors (241 pre-existing warnings)
- Frontend: build ✅ (489ms), tests 221/221 ✅, lint 0 errors (26 pre-existing warnings)

## Session 37 — Code Review Round 5 Batch 9: 9 Quality & Security Issues Fixed (2026-07-06)

### Fixed (Critical)
- **Email case-sensitivity mismatch (C1)**: `UsersService.create()` and `UsersService.update()` now normalize email to lowercase before storage, matching the existing normalization in `AuthService.login()`. Previously, users created with mixed-case emails could not log in because PostgreSQL case-sensitive `=` comparison failed. Added service-level tests for normalization behavior.
- **`Prisma.raw()` sort direction injection vector (C2)**: `TicketRepository.findManySortedBySlaStatus()` now validates `sortOrder` against `['asc', 'desc']` before passing to `Prisma.raw()`. Added defense-in-depth to the raw SQL code path.
- **TanStack Query cache mutation (C3)**: `TicketsService.findAll()` no longer mutates Prisma result objects in-place when enriching `_count` for EndUser. Uses `.map()` to create new objects, preserving cache integrity.

### Fixed (Important)
- **Refresh token consumed before user validation (I5)**: `AuthService.refresh()` now validates user existence and activity via `redisService.get()` BEFORE consuming the token atomically via `GETDEL`. Prevents permanent session loss on transient DB failures. If the user is inactive, the token is still consumed to prevent replay after reactivation.
- **Maintenance polling overhead (I7)**: `useMaintenanceMode` now uses a dynamic `refetchInterval` function: fast-polls (15s) only when maintenance is active; stops polling when disabled. Re-enabled by window focus refetch or 503 axios interceptor. Reduces unnecessary network traffic for all users.
- **Unvalidated `sortOrder` in `findAll` (I1)**: Added `orderDir = sortOrder === 'asc' ? 'asc' : 'desc'` validation in `TicketsService.findAll()`, matching the existing pattern in `exportCsvToResponse()`.
- **Delete endpoint inconsistent return shape (I2)**: `TicketsController.delete()` now returns `Promise<void>` instead of `{ message: string }`. The response goes through `TransformInterceptor` which wraps it correctly as `{ data: {} }`.

### Fixed (Minor)
- **WebSocket gateway inline CORS logic (M1)**: Replaced duplicate `getCorsOrigin()` function in `NotificationsGateway` with shared `getCorsOrigins()` from `env-validation.util.ts`.
- **CSV export streaming error resilience (M3)**: Wrapped streaming loop in `try/finally` to ensure `res.end()` is always called, preventing hanging HTTP connections on mid-stream errors.

### Changed
- **`AuthService.refresh()`** now uses a two-step Redis pattern: `GET` for validation → user lookup → `GETDEL` for atomic consumption. In the rare case of concurrent refresh attempts, the second caller receives "Refresh token has been revoked" (token was already consumed by the first).
- **`UsersService.update()`** normalized email detection: uses case-insensitive comparison (`user.email.toLowerCase()`) to differentiate between an email address change and a case-only normalization of the same address. The latter does not trigger a uniqueness conflict check.
- **`useMaintenanceMode`** hook: `refetchInterval` is now a function of query state rather than a constant — stops polling when maintenance mode is disabled.

### Verification
- Backend: build ✅, tests 757/757 ✅, lint 0 errors
- Frontend: build ✅ (584ms), tests 221/221 ✅, lint 0 errors

### Files Changed
- `backend/src/users/users.service.ts` — email normalization in create/update
- `backend/src/users/__tests__/users.service.spec.ts` — NEW service-level tests
- `backend/src/common/repositories/ticket.repository.ts` — sortOrder validation
- `backend/src/tickets/tickets.service.ts` — cache-safe _count, sortOrder validation, CSV try/finally
- `backend/src/tickets/tickets.controller.ts` — void return for delete
- `backend/src/tickets/tickets.controller.spec.ts` — updated test expectation
- `backend/src/auth/auth.service.ts` — two-step refresh (GET before GETDEL)
- `backend/src/auth/auth.service.spec.ts` — updated refresh tests + inactive user test
- `backend/src/notifications/notifications.gateway.ts` — shared CORS origin
- `frontend/src/hooks/use-maintenance.ts` — dynamic refetchInterval

## Session 36 — Code Review Round 5 Fixes (2026-07-06)

### Fixed (Critical)
- **`AuthService` blocking bcrypt in constructor**: Moved `bcrypt.hashSync()` (blocking ~250ms) to `OnModuleInit` lifecycle hook via async `bcrypt.hash()`. Event loop no longer blocked during module initialization. `auth.service.spec.ts` updated to call `await module.init()` after compilation.
- **`TicketRepository.findById()` unsafe type cast**: Replaced `as unknown as Prisma.TicketFindUniqueArgs` with explicit args construction using spread pattern — type safety preserved, no more double-cast bypass.
- **`HttpExceptionFilter` malformed array error messages**: Validation pipe errors can contain non-string items (e.g., constraint objects). Updated `.join(', ')` to filter only string items before concatenation — prevents `[object Object]` in error responses.
- **`PasswordInput` tests broken after UX change**: 3 tests still tested old long-press behavior (mousedown/mouseup with timers). Rewrote to test current click-toggle behavior — 221/221 frontend tests now passing.
- **Nginx SSL CSP blocks WebSocket on `/assets/` and `/index.html`**: Both location blocks in `nginx.ssl.conf` were missing `ws: wss:` in `connect-src`. Added to match the root `/` block — WebSocket connections now work in production when assets are served via explicit location blocks.

### Fixed (Important)
- **`MaintenanceService` hardcoded delay**: Replaced literal `1000` with `appConfig.maintenance.backupIdRetryDelayMs` — consistent with centralized config pattern.
- **`app.config.ts` `envNumber()` NaN injection**: Non-numeric env values (e.g., `export AUTH_MAX_FAILED_ATTEMPTS=abc`) now fall back to `defaultValue` instead of propagating `NaN`.
- **`RedisService` spread arguments may hit engine limits**: Changed `this.client.mget(...keys)` to `this.client.mget(keys)`, `this.client.del(...keys)` to `this.client.del(keys)` in `deleteByPattern`. ioredis accepts arrays directly, preventing potential JS engine argument limit issues with large key sets.
- **`use-notifications` select side-effect causing extra re-renders**: Moved `setUnreadCount()` from TanStack Query's `select` callback (runs on every Layout render) to `useEffect` — no more unnecessary re-renders across the entire app tree.
- **`Modal` missing `aria-hidden` on backdrop**: Added `aria-hidden="true"` to backdrop overlay — screen readers no longer interact with content beneath the modal.
- **`thumbnail-cache.ts` unsafe type assertion**: Replaced `as [string, string]` cast with runtime guard checking `entries().next().value` before destructuring — prevents silent `[undefined, undefined]` in edge case.

### Changed
- **`AuthService`**: Now implements `OnModuleInit`. `dummyHash` initialized asynchronously instead of blocking constructor. No behavioral change — `dummyHash` is always ready before the first request.
- **`RedisService.mget()` and `RedisService.deleteByPattern()`**: Now pass arrays directly to ioredis instead of spreading — functionally identical but avoids theoretical argument length limit.
- **`PasswordInput.test.tsx`**: Replaced 3 long-press tests with click-toggle tests. Added one additional test for toggle behavior (password→text→password). Removed `vi.useFakeTimers()` setup since no longer needed.

### Verification
- Backend: build ✅, tests 752/752 ✅, lint 0 errors
- Frontend: build ✅ (542ms), tests 221/221 ✅, lint 0 errors

### Files Changed
- `backend/src/auth/auth.service.ts` — `OnModuleInit`, async bcrypt
- `backend/src/auth/auth.service.spec.ts` — `await module.init()`
- `backend/src/common/repositories/ticket.repository.ts` — explicit args
- `backend/src/common/filters/http-exception.filter.ts` — safe string join
- `backend/src/common/config/app.config.ts` — NaN guard in envNumber()
- `backend/src/redis/redis.service.ts` — array args for mget/del
- `backend/src/maintenance/maintenance.service.ts` — appConfig delay
- `frontend/src/components/ui/__tests__/PasswordInput.test.tsx` — click-toggle tests
- `frontend/src/hooks/use-notifications.ts` — useEffect instead of select
- `frontend/src/components/ui/Modal.tsx` — aria-hidden on backdrop
- `frontend/src/lib/thumbnail-cache.ts` — safe cast with runtime guard
- `nginx/nginx.ssl.conf` — ws: wss: in CSP for /assets/ and /index.html

### Fixed (Session 36 — Batch 2)
- **WebP magic-byte detection**: Added `WEBP` identifier at offset 8-11 (`0x57 0x45 0x42 0x50`) to RIFF container check. Previously any RIFF-format file (AVI, WAV) with `image/webp` MIME would pass validation.
- **`vite.config.ts` `__dirname` in ESM context**: Replaced implicit `__dirname` (undefined in ESM) with `fileURLToPath(import.meta.url)` — compatible with Vite 8 ESM config loading.
- **`ProtectedRoute` loading flash + stale setState**: Replaced `if (checking) return null` with animated spinner. Added `cancelled` flag in `useEffect` cleanup to prevent `setState` on unmounted component.
- **`SubCategoryRepository.findById()` unsafe type cast**: Replicated `TicketRepository.findById()` fix — replaced `as unknown as Prisma.SubCategoryFindUniqueArgs` with explicit args construction.
- **`tickets.service.ts` cast cleanups**: Changed `userRole as TicketAccessScope['role']` to `userRole as 'EndUser' | 'ITSupport' | 'Admin'` for narrower type assertion.

### Verification (Batch 2)
- Backend: build ✅, tests 752/752 ✅, lint 0 errors
- Frontend: build ✅ (572ms), tests 221/221 ✅, lint 0 errors
- Production `as unknown` casts: 0 in production code (test-only + 2 unavoidable Prisma generic includes remain)

### Files Changed (Batch 2)
- `backend/src/common/utils/mime-validation.util.ts` — WebP WEBP bytes at offset 8
- `backend/src/common/repositories/sub-category.repository.ts` — explicit Prisma args
- `backend/src/tickets/tickets.service.ts` — narrower type assertion
- `frontend/vite.config.ts` — ESM-safe __dirname via import.meta.url
- `frontend/src/auth/ProtectedRoute.tsx` — spinner + cancelled cleanup

## Session 35 — Code Review Comprehensive Fixes (2026-07-06)

### Fixed (Critical)
- **`HttpExceptionFilter` silent non-HTTP errors**: Added `Logger.error()` for non-HttpException exceptions before returning generic 500. Production debugging no longer blind to unhandled errors.
- **`MaintenanceGuard` fragile `getResponse` mutation**: Replaced `exception.getResponse = () => ({})` with `ServiceUnavailableException({ ... })` body. Removed dead `enabled`/`message` variables.
- **`PasswordInput` dangerous prop spreading + long-press UX**: Replaced `InputHTMLAttributes` raw spread with `Omit<'type'>` to prevent conflicting `type` prop. Changed long-press (100ms threshold) to standard click-toggle with eye icon.
- **Duplicate thumbnail cache (CommentSection + AttachmentList)**: Extracted to shared `@/lib/thumbnail-cache.ts` with `cacheThumbnail()` and `getCachedThumbnail()`.

### Fixed (Important)
- **`RedisService` password injection heuristic**: Replaced `!url.includes('@')` with proper `parsedUrl.password` check — false positive when URL contains username but no password.
- **`AttachmentsController` stream error handler**: Added `res.end()` in else branch to prevent hanging connections.
- **`AttachmentsController` hardcoded `MAX_FILE_SIZE`**: Replaced literal `10 * 1024 * 1024` with `appConfig.fileUpload.maxDirectFileSize`.
- **`app.config.ts` `Number(env) || default` pattern**: Extracted `envNumber()` helper that checks `val !== undefined` instead of truthy — allows `0` as valid override value.
- **`JwtModule` duplicated registration**: Extracted shared config to `backend/src/common/config/jwt.config.ts` — both `AuthModule` and `NotificationsModule` import from the same source.
- **`Navbar` dropdown accessibility**: Added `Escape` key listener to close notification and profile dropdowns.
- **`UserManagement` missing client-side validation**: Added name/email/password checks before submission.
- **`TicketFilters` JSON.stringify comparison**: Replaced with explicit field-by-field comparison for change detection.

### Fixed (Minor)
- **`CommentsController` hardcoded constants**: Replaced literal `MAX_FILE_SIZE` and `MAX_FILES_PER_COMMENT` with `appConfig.fileUpload` values.
- **`CreateCommentDto` missing `@MinLength(1)`**: Added for consistency with other text-field DTOs.
- **`UpdateSubCategoryDto` manual field definitions**: Replaced with `PartialType(CreateSubCategoryDto)` + `isActive` override.
- **`Pagination` semantic HTML**: Changed `<p>` inside `<nav>` to `<span>`.
- **`use-tickets` redundant JSON.stringify**: Removed from query key — TanStack Query v5 already performs stable hashing.
- **`use-telegram` inline types**: Moved `TelegramSettings`, `TelegramConfig`, `TelegramCheckResult` to `@/types/index.ts`.
- **`App.tsx` flash redirect**: Changed `/` redirect from `/login` to `/tickets` — authenticated users see redirect less often.
- **`use-notifications` Zustand sync effect**: Replaced `useEffect` with `select` callback for count sync — eliminates unnecessary re-renders when count unchanged.

### Changed
- **`PasswordInput` UX**: Changed from "hold to reveal" (long-press with 100ms threshold) to standard click-toggle. Users now click the eye icon to toggle password visibility, matching platform conventions.
- **`app.config.ts`**: Replaced inline `Number(env) || default` expressions with `envNumber(key, default)` helper. Behavior unchanged for all existing values (all positive).
- **`MaintenanceGuard`**: Simplified `canActivate` — replaced try/catch with `.catch(() => null)` for Redis fetch; renamed `isAdminRequest` to `shouldAllowDuringMaintenance` with JSDoc.

### Dependencies
- `@nestjs/mapped-types` — already present, now used by `UpdateSubCategoryDto` via `PartialType`.

### Verification
- Backend: build ✅, ESLint **0 errors**
- Frontend: build ✅ (597ms), ESLint **0 errors**

### Files Changed
- `backend/src/common/filters/http-exception.filter.ts` — Logger + non-HttpException logging
- `backend/src/common/guards/maintenance.guard.ts` — simplified getResponse, renamed method
- `backend/src/common/config/app.config.ts` — envNumber helper
- `backend/src/common/config/jwt.config.ts` — NEW shared JWT config
- `backend/src/redis/redis.service.ts` — parsedUrl.password check
- `backend/src/attachments/attachments.controller.ts` — appConfig + res.end
- `backend/src/comments/comments.controller.ts` — appConfig
- `backend/src/comments/dto/create-comment.dto.ts` — @MinLength(1)
- `backend/src/sub-categories/dto/update-sub-category.dto.ts` — PartialType
- `backend/src/auth/auth.module.ts` — shared JWT config
- `backend/src/notifications/notifications.module.ts` — shared JWT config
- `frontend/src/lib/thumbnail-cache.ts` — NEW shared thumbnail cache
- `frontend/src/components/ui/PasswordInput.tsx` — click-toggle, Omit props
- `frontend/src/components/tickets/CommentSection.tsx` — use shared thumbnail cache
- `frontend/src/components/tickets/AttachmentList.tsx` — use shared thumbnail cache
- `frontend/src/layout/Navbar.tsx` — Escape key handler
- `frontend/src/components/ui/Pagination.tsx` — p → span
- `frontend/src/App.tsx` — / → /tickets
- `frontend/src/hooks/use-tickets.ts` — remove JSON.stringify
- `frontend/src/hooks/use-telegram.ts` — import from @/types
- `frontend/src/hooks/use-notifications.ts` — select instead of useEffect
- `frontend/src/types/index.ts` — Telegram types
- `frontend/src/components/admin/UserManagement.tsx` — client-side validation
- `frontend/src/components/tickets/TicketFilters.tsx` — field-by-field comparison
- `frontend/src/components/account/TelegramConfigSection.tsx` — import from @/types

## Session 34 — Code Review Round 4 Fixes Batch 6 (2026-07-06)

### Fixed (Minor)
- **`ticket.repository.ts` dead `groupBy(args: any)`**: Removed unused method that was the last `any` in repository production code.
- **`user.repository.ts` loose typing**: `create(data: Record<string, unknown>)` → `create(data: Prisma.UserCreateInput)`; `update(id, data: Record<string, unknown>)` → `update(id, data: Prisma.UserUpdateInput)`.
- **`telegram-config.repository.ts` loose typing**: `findOrCreate`, `create`, `update` changed from `Record<string, unknown>` to proper `Prisma.TelegramConfig*Input` types.
- **`telegram.service.ts` untyped callback**: Removed `: any` from `users.filter((u: any) => …)` and `runWithConcurrency(…, async (user: any) => …)` in `sendTicketEvent`.

### Verification
- Backend: 752 tests (72 suites) — all passed
- Frontend: 223 tests (44 suites) — all passed
- Build: ✅ (backend + frontend)
- ESLint: **0 errors**, 232 warnings (all in test files; down from 235)

## Session 33 — Code Review Round 3 Fixes Batch 5 (2026-07-06)

### Fixed (Important)
- **`users.service.ts` reactivated user `as any`**: Replaced `as any` with `as unknown as Prisma.UserGetPayload<Record<string, never>> & { reactivated: boolean }`.
- **`sla.service.ts` nested include `as any`**: Replaced `(ticket as any).category.slaConfigs` with `ticket as unknown as { category: { slaConfigs: ... } }`.
- **`comments.service.ts` `userRole as any`**: Changed to `userRole as UserRole` (with proper `UserRole` import from policy).
- **`tickets.service.ts.findAll` `Record<string, unknown>`**: Replaced untyped `Record<string, unknown>` with `Prisma.TicketWhereInput` + `Prisma.DateTimeFilter` (same pattern as `exportCsvToResponse` fix from Batch 4).

### Fixed (Minor)
- **`tickets.service.ts` unused `UserRole` import**: Removed.
- **`tickets.service.ts` `context.ticket?: any`**: Typed with explicit shape `{ id, ticketNumber, subject, status, requesterId, assignedToId }`.
- **`tickets.service.ts.findById` `include: Record<string, unknown>`**: Replaced with `Prisma.TicketFindUniqueArgs['include']`.
- **`comments.service.ts` `where: Record<string, unknown>`**: Replaced with `Prisma.CommentWhereInput`.
- **`users.service.ts` `data: Record<string, unknown>`**: Replaced with `Prisma.UserUpdateInput`.

### Verification
- Backend: 752 tests (72 suites) — all passed
- Frontend: 223 tests (44 suites) — all passed
- Build: ✅ (backend + frontend)
- ESLint: **0 errors**, 235 warnings (all in test files; down from 241 after removing 6 remaining `as any`/untyped patterns from production code)

## Session 32 — Code Review Re-Review Fixes Batch 4 (2026-07-06)

### Fixed (Critical)
- **Telegram `checkConfig()` groupChat token leak**: GroupChat API error handler now strips bot token from error messages before returning to frontend (matching the bot check fix from Session 31). Prevents token leakage on network errors during group chat validation.

### Fixed (Important)
- **`sub-category.repository.ts` remaining `as any` casts**: `findById()` and `findUnique()` now use proper Prisma generics (`Prisma.SubCategoryFindUniqueArgs`, `Prisma.SubCategoryGetPayload`) instead of `any` parameters and casts.
- **`ticket.repository.ts` remaining `as any` casts**: `create()` → typed `Prisma.TicketCreateArgs`; `findById()` → typed `Prisma.TicketFindUniqueArgs['include']`; `findManyForUser()` → typed `Prisma.TicketFindManyArgs`. Return types are properly inferred.
- **`tickets.service.ts` `as any` cascade (6 sites)**: Export CSV `where` → `Prisma.TicketWhereInput` with proper `Prisma.DateTimeFilter` for date ranges; `orderBy` → `Prisma.TicketOrderByWithRelationInput[]`; `updateData` → `Prisma.TicketUpdateManyMutationInput`; batch iteration → explicit typed shape; attachments access → typed cast.
- **`notification.repository.ts` typing**: `Record<string, unknown>` → `Prisma.NotificationWhereInput` for type-safe query building.

### Fixed (Minor)
- **`buildSafeUploadPath` dead code**: Removed unused `ALLOWED_EXTENSIONS` set after switching to original-extension-only approach (per Session 31 Critical fix #4).
- **Telegram `checkConfig()` `replace` → `replaceAll`**: Bot error handler uses `replaceAll` for more robust token stripping.
- **`concurrency.util.ts` guard**: Added `Math.max(1, …)` to prevent negative/zero worker count from causing silent empty results.
- **Frontend `ApiEnvelope.totalPages` and `PaginatedResponse.totalPages`**: Changed from optional (`?`) to required to match backend contract — `totalPages` is always returned even for empty results.

### Changed
- **`TransformInterceptor`**: Added `response.writableEnded` check to detect streaming/manual `@Res()` responses before checking content-type header, avoiding unnecessary wrapping work for CSV exports.
- **`MIME_COMPATIBILITY_MAP` docs**: Added clarifying JSDoc explaining why CSV (no magic bytes → null detection) and RAR (self-matching signature) don't need compatibility map entries.
- **`MaintenanceService.listBackups()`**: Replaced shared-mutable worker pool with `Promise.all(recentIds.map(…))` — eliminates race condition from concurrent `queue.shift()` and `results.push()`.
- **`SLAService.recalculateOpenTicketsForConfig()`**: Replaced `Promise.all(tickets.map(…))` (500 concurrent individual `Prisma.ticket.update()` calls) with a single `$executeRaw` UPDATE that computes `slaDueAt` per-row from each ticket's own `createdAt` — prevents connection pool exhaustion.
- **`TicketRepository.getDashboardCurrentSnapshot()`**: Consolidated 5 separate `Prisma.ticket.count()` calls into a single `$queryRaw` with `COUNT(*) FILTER(WHERE …)` clauses.
- **`NotificationsGateway`**: Added `@OnEvent('user.deleted')` handler via shared `disconnectUserSockets()` method. Added `MAX_SETTIMEOUT_DELAY` cap (`2_147_483_647` ms) to prevent Node.js `setTimeout` overflow for very long-lived access tokens.
- **`MaintenanceService.createBackupId()`**: Added millisecond precision (`pad(now.getMilliseconds(), 3)`) to backup ID to prevent collision on rapid backup creation. Updated `BACKUP_ID_PATTERN` and `backupIdToIso()` parser accordingly.
- **`MaintenanceService` test IDs**: Updated all backup ID fixtures from `YYYYMMDD-HHMMSS` (15 chars) to `YYYYMMDD-HHMMSSsss` (18 chars) to match new format.
- **`E2E` smoke test**: Moved shared `accessToken`/`ticketId` from module-level `let` into `describe`-scoped `state` object for proper test isolation.

### Verification
- Backend: 752 tests (72 suites) — all passed
- Frontend: 223 tests (44 suites) — all passed
- Build: ✅ (backend + frontend)
- ESLint: 0 errors, 241 warnings (all in test files; down from 262 after removing 21 `as any` from production code)

### Files Changed
- `backend/src/common/interceptors/transform.interceptor.ts` — writableEnded detection
- `backend/src/common/repositories/notification.repository.ts` — Prisma.WhereInput typing
- `backend/src/common/repositories/sub-category.repository.ts` — removed as any
- `backend/src/common/repositories/ticket.repository.ts` — removed as any, add recalculateSlaBatch, consolidated dashboard COUNT
- `backend/src/common/utils/concurrency.util.ts` — non-positive limit guard
- `backend/src/common/utils/mime-validation.util.ts` — clarified CSV/RAR docs
- `backend/src/common/utils/upload.util.ts` — removed ALLOWED_EXTENSIONS dead code
- `backend/src/dashboard/dashboard.service.ts` — doc comment for defense-in-depth slice
- `backend/src/maintenance/maintenance.service.spec.ts` — updated backup ID format
- `backend/src/maintenance/maintenance.service.ts` — race condition fix, millisecond backup ID
- `backend/src/notifications/notifications.gateway.ts` — setTimeout cap, user.deleted handler
- `backend/src/sla/sla.service.spec.ts` — updated tests for batch SQL
- `backend/src/sla/sla.service.ts` — batch SQL update
- `backend/src/telegram/telegram.service.ts` — token leak fix both catch blocks
- `backend/src/tickets/tickets.service.ts` — removed as any cascade, typed where/updateData
- `backend/test/smoke.e2e.spec.ts` — test isolation fix
- `frontend/src/lib/axios.ts` — totalPages non-optional
- `frontend/src/types/index.ts` — totalPages non-optional, RefreshResponse non-nullable

## Session 31 — Code Review Fixes Batch 3 (2026-07-06)

### Fixed (Critical)
- **pg_dump `--no-owner`**: `MaintenanceService.createPgDumpOptions()` now passes `--no-owner` and `--no-privileges` to prevent restore failure when DB role names differ between environments (dev/staging/prod).
- **`users.service.ts` uncaught `emitAsync`**: `user.deleted` event emission now wrapped in try/catch with `Logger.error()` — revocation failures no longer propagate as 500 after successful DB deletion, preventing client retry inconsistency.
- **Restore pipeline `set -o pipefail`**: The `gzip | awk | psql` pipeline in `restoreDb()` now uses `set -o pipefail` so gzip failures during streaming are detected rather than depending on psql's exit code.
- **WebSocket reconnection**: Removed `socket.disconnect()` from `connect_error` handler (root cause of silent notification loss). Added `reconnect_attempt` handler that reads latest access token via `useAuthStore.getState().accessToken` and updates `socket.auth` so reconnection attempts use a fresh token. Effect cleanup + re-creation on `accessToken` change provides secondary recovery path.
- **Repository `as any` casts**: Removed all `as any` casts from 9 repository files (`user`, `ticket`, `comment`, `attachment`, `category`, `sub-category`, `sla-config`, `notification`, `telegram-config`). Replaced with proper Prisma generics (`Prisma.TicketGetPayload`, `Prisma.CommentGetPayload`, etc.) and inferred return types. Updated 3 caller files (`tickets.service.ts`, `attachments.service.ts`, `sub-categories.service.ts`) and 3 test files to match new signatures.

### Fixed (Important)
- **`ApiResponse.meta` missing `totalPages`**: Interface updated to include `totalPages: number` — contract now matches actual API response shape.
- **`useTickets` query key instability**: Changed query key from `['tickets', filters]` to `['tickets', JSON.stringify(filters)]` so identical filter objects produce stable keys regardless of object reference.
- **Docker `init: true`**: Added to all 5 services (`frontend`, `nginx`, `api`, `db`, `cache`) for proper signal propagation and zombie reaping.
- **`ProtectedRoute` bypasses interceptors**: Extracted `refreshAccessToken()` to `axios.ts` (exports named function using bare axios to avoid refresh-loop). `ProtectedRoute` now imports and uses it instead of bare `axios.post()`.
- **`slaDueAt` and `slaStatus` nullable**: Changed `DateTime` → `DateTime?` and `SLAStatus` → `SLAStatus?` in schema. New migration `20260706072006_make_sla_due_at_nullable`. When no SLA config matches `(categoryId, priority)`, both fields are `null` instead of 24h fallback. `calculateSlaStatus()` accepts `Date | null`. Removed `defaultSlaWindowMin` from `app.config.ts`.
- **Seed compilation**: Created `tsconfig.seed.json` extending main `tsconfig.json`. Dockerfile uses `npx tsc -p tsconfig.seed.json` instead of inline flags, ensuring seed compilation stays in sync with project config.
- **E2E smoke test env-locked**: `smoke.e2e.spec.ts` now reads `E2E_HOST`, `E2E_PORT`, `E2E_PROTOCOL` from env vars (defaults: `localhost:80/http`). Supports both `http` and `https` modules dynamically.
- **Concurrency util semaphore**: Replaced serial-batch implementation with semaphore-based worker pool — starts next item as soon as one finishes instead of waiting for full batch. New test file with 7 tests verifying concurrency enforcement, result ordering, and rejection handling.
- **Seed failure handling in entrypoint**: `docker-entrypoint.sh` now checks if `dist/prisma/seed.js` exists before executing seed. Seed failures now exit with actual error code instead of silent fallback message.

### Verification
- Backend: 752 tests (72 suites) — all passed
- Frontend: 223 tests (44 suites) — all passed
- Build: ✅ (backend + frontend)
- ESLint: 0 errors, 262 warnings (all in test files)

### Files Changed
- `backend/src/common/interfaces/api-response.interface.ts` — added `totalPages`
- `backend/src/common/repositories/{user,ticket,comment,attachment,category,sub-category,sla-config,notification,telegram-config}.repository.ts` — removed `as any` casts
- `backend/src/common/utils/concurrency.util.ts` — semaphore-based worker pool
- `backend/src/common/utils/__tests__/concurrency.util.spec.ts` — **new**: 7 tests
- `backend/src/tickets/tickets.service.ts` — no 24h SLA fallback, nullable slaDueAt/slaStatus
- `backend/src/sla/sla.service.ts` — `calculateSlaStatus()` nullable support, SLA breach skip if null
- `backend/src/users/users.service.ts` — try/catch around `emitAsync`, added `Logger`
- `backend/src/users/users.service.spec.ts` — updated revocation test
- `backend/src/maintenance/maintenance.service.ts` — `--no-owner --no-privileges` on pg_dump, `set -o pipefail` on restore
- `backend/prisma/schema.prisma` — `slaDueAt` and `slaStatus` nullable
- `backend/prisma/migrations/20260706072006_make_sla_due_at_nullable/migration.sql` — **new**
- `backend/tsconfig.seed.json` — **new**
- `backend/Dockerfile` — uses tsconfig.seed.json for seed compilation
- `backend/docker-entrypoint.sh` — seed presence check + proper error exit
- `backend/test/smoke.e2e.spec.ts` — env vars for host/port/protocol
- `backend/src/common/config/app.config.ts` — removed `defaultSlaWindowMin`
- `docker-compose.yml` — added `init: true` to all services
- `frontend/src/hooks/use-socket.ts` — `reconnect_attempt` handler, removed `connect_error` disconnect
- `frontend/src/hooks/use-tickets.ts` — stable query key via `JSON.stringify`
- `frontend/src/auth/ProtectedRoute.tsx` — uses `refreshAccessToken()` from axios module
- `frontend/src/lib/axios.ts` — **new** exported `refreshAccessToken()`
- `frontend/src/hooks/__tests__/use-socket.test.tsx` — updated for new reconnect behavior
- `frontend/src/auth/__tests__/ProtectedRoute.test.tsx` — updated for new refresh call pattern

### Added
- **7 controller tests (100% coverage!)**: attachments, sub-categories, sla, dashboard, telegram, maintenance, health — semua controller sekarang punya test.
- **6 page tests (100% coverage!)**: CreateTicketPage, TicketDetailPage, MyAccountPage, AdminUsersPage, AdminMasterDataPage, AdminMaintenancePage — semua halaman sekarang punya test.
- **6 service tests**: sub-categories.service (14 tests), redis.service (17 tests), prisma.service (5 tests), comments.service (20 tests), attachments.service (18 tests), telegram.service (35 tests).
- **23 DTO validation tests (+235 tests)**: Semua DTO yang tersisa sekarang punya validation coverage.
- **12 component tests**: Table, Switch, LoadingSpinner, EmptyState, ErrorMessage, ConfirmDialog, PasswordInput (UI) + TicketList, StatusBadge, PriorityBadge (tickets) + PasswordChangeSection, TelegramConfigSection (account).
- **E2E smoke test (9 tests)**: `test/smoke.e2e.spec.ts` — health → login → categories → create ticket → update status → comment → dashboard stats → delete → refresh 401. Run via `npm run test:e2e`.
- **Backend ESLint**: Install `eslint` + `typescript-eslint` flat config (v10), 0 errors.
- **3 ESLint production bug fixes**: unused imports di attachments.controller, attachments.service, auth.service, attachment-visibility.policy, maintenance.guard (no-useless-assignment).

### Changed
- **TelegramConfigSection test**: Fixed type issues with TanStack Query mock types.
- **EmptyState test**: Fixed TypeScript unused variable issues.

### Verification
- Backend: 745 tests (71 suites) — all passed
- Frontend: 222 tests (44 suites) — all passed
- E2E: 9 tests — all passed
- Build: ✅
- ESLint: 0 errors, 299 warnings (all `no-explicit-any` in test files)

### Files Changed
- 7 controller test files, 6 page test files, 6 service test files, 23 DTO test files, 12 component test files, 1 E2E test file
- `eslint.config.js` — **new**: backend ESLint flat config
- `jest.e2e.config.js` — **new**: E2E test config
- Various minor fixes

## Session 29 — Magic Numbers Extraction & MyAccountPage Split (2026-07-06)

### Changed
- **30+ magic numbers → centralized `appConfig`**: Semua hardcoded numeric constants dari auth, dashboard, SLA, maintenance, telegram, file upload, dan tickets service dipindahkan ke `backend/src/common/config/app.config.ts`. Setiap nilai punya environment variable override.
- **MyAccountPage.tsx split (511 → ~50 lines)**: Extract `TelegramConfigSection` (393 lines) dan `PasswordChangeSection` (95 lines) ke komponen terpisah di `components/account/`. MyAccountPage sekarang hanya orchestrate 3 komponen independen.

### Added
- `backend/src/common/utils/transform.util.ts` — shared `trimString` transformer (sebelumnya duplikasi di 2 DTO)
- `backend/src/common/utils/pagination.util.ts` — shared `buildPaginationMeta()` (sebelumnya di-copy di 5 files)

### Fixed
- **Dead code dihapus**: 4 method tidak dipanggil di `ticket.repository.ts` (`delete()`, `getSLAStats()`, `getAvgResolutionTimeByCategory()`, `transactionBatch()`) + 3 test terkait.
- **Unused imports**: `uuidv4` dan `path` dari `comments.service.ts` dan `attachments.service.ts`.
- **SLA calculation duplication**: Method `calculateSlaStatus()` diubah dari `private` ke `public` di `sla.service.ts`. `tickets.service.ts` sekarang memanggil `this.slaService.calculateSlaStatus()` alih-alih duplikasi logic.

### Verification
- Backend: 375 tests — all passed
- Frontend: 88 tests — all passed
- Build: ✅

## Session 28 — Maintainability Quick Wins (2026-07-06)

### Changed
- **30+ magic numbers → centralized `appConfig`**: Auth (max attempts, lock duration), Dashboard (cache TTL), SLA (batch size, threshold, lock TTL), Maintenance (drain, lock TTLs, buffer, workers), Telegram (poll timeout, link expiry, concurrency), File upload (max sizes, max files), Tickets (export rows, batch, retries) — semua bisa di-override via env vars.
- **Backend ESLint**: Install `eslint` + `typescript-eslint` + `@eslint/js` (flat config v10). Fix 4 production code issues (unused imports, useless assignment). Run via `npm run lint`.
- **Test infrastructure**: Jest config diperluas, `jest.e2e.config.js` untuk E2E tests.

### Fixed
- **BUG-18**: `ThrottlerException` sekarang return `TOO_MANY_REQUESTS` code, bukan `UNKNOWN_ERROR` (tambah `[429]: 'TOO_MANY_REQUESTS'` di `HttpExceptionFilter`).
- **BUG-19**: `auth/refresh` tanpa cookie sekarang return HTTP 401, bukan 201 with null data.
- **ESLint di container frontend**: Dockerfile sekarang copy `.eslintrc.cjs` dan `.eslintignore`.

### Documentation
- **AGENTS.md**: Tambah `TOO_MANY_REQUESTS` ke stable codes, dokumentasi enum format, detail dashboard response.
- **ARCHITECTURE.md**: Update stable codes list.
- **README.md**: Update refresh endpoint description.

### Verification
- Backend: 341 tests — all passed
- Frontend: 73 tests — all passed
- Build: ✅
- ESLint: 0 errors

## Session 27 — Comprehensive Bugfix & Documentation Update (2026-07-06)

### Fixed
- **BUG-18: ThrottlerException returns `UNKNOWN_ERROR` code instead of `TOO_MANY_REQUESTS`** — `HttpExceptionFilter.getCodeFromStatus()` mapping tidak menyertakan `429 Too Many Requests`, sehingga rate-limited requests menerima error code `UNKNOWN_ERROR` yang tidak tercantum sebagai stable code. Fix: tambah `[HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS'` ke status-to-code mapping. Unit test ditambahkan untuk memverifikasi mapping 429 dan error codes lainnya.
- **BUG-19: `auth/refresh` tanpa cookie mengembalikan HTTP 201 Created dengan `{ accessToken: null, user: null }`** — Semantik salah: seharusnya 401 Unauthorized. Frontend sudah handle kedua kasus (null response via `if (!accessToken)` dan error via catch). Fix: ganti `return { accessToken: null, user: null }` menjadi `throw new UnauthorizedException('Refresh token not provided')` di `auth.controller.ts`. Test diupdate untuk expect `UnauthorizedException`.
- **ESLint gagal di production container frontend** — `frontend/Dockerfile` tidak menyalin `.eslintrc.cjs` dan `.eslintignore`, sehingga `npm run lint` di container builder gagal dengan "ESLint couldn't find a configuration file". Fix: tambah COPY commands untuk kedua file.

### Documentation
- **AGENTS.md**: Tambah `TOO_MANY_REQUESTS` ke daftar stable error codes; tambah dokumentasi format enum status (`Open`, `InProgress`, `OnHold`, `Resolved`, `Closed`) dan priority (`Low`, `Medium`, `High`, `Critical`) — menggunakan PascalCase tanpa spasi; tambah detail inner structure dashboard response (`current.activeTickets`, `attention.slaRisk[]`, `analytics.range`, dll).
- **ARCHITECTURE.md**: Update daftar stable error codes di deskripsi `HttpExceptionFilter` untuk menyertakan `TOO_MANY_REQUESTS`.
- **README.md**: Update deskripsi endpoint `POST /api/auth/refresh` untuk menyebutkan return `401` dengan `UNAUTHORIZED` code saat cookie tidak ada.

### Files Changed
- `backend/src/common/filters/http-exception.filter.ts` — tambah mapping 429 → `TOO_MANY_REQUESTS`
- `backend/src/common/filters/http-exception.filter.spec.ts` — **new**: 4 unit test untuk exception filter
- `backend/src/auth/auth.controller.ts` — throw `UnauthorizedException` saat refresh cookie tidak ada
- `backend/src/auth/auth.controller.spec.ts` — update test untuk expect exception
- `frontend/Dockerfile` — tambah COPY `.eslintrc.cjs` dan `.eslintignore`
- `AGENTS.md` — stable codes, enum format, dashboard structure
- `ARCHITECTURE.md` — stable codes list
- `README.md` — refresh endpoint description
- `CHANGELOG.md` — this entry

## Session 26 — Self-Host Google Font (Inter) untuk CSP Compliance (2026-07-06)

### Fixed
- **CSP style-src warning di login page**: Font Inter sebelumnya dimuat dari `fonts.googleapis.com` (external stylesheet), tetapi CSP hanya mengizinkan `'self' 'unsafe-inline'` untuk `style-src`. Browser memblokir stylesheet font, menghasilkan warning `Content-Security-Policy: style-src-elem` di console.
- Solusi: self-host font Inter via `@fontsource/inter` npm package. File `.woff2`/`.woff` di-bundle sebagai aset lokal, sehingga memenuhi `style-src 'self'` dan `font-src 'self'` tanpa perlu melonggarkan CSP.

### Files Changed
- `frontend/package.json` — tambah dependency `@fontsource/inter` (^5.0.20).
- `frontend/src/main.tsx` — import 4 weight CSS (400, 500, 600, 700) dari `@fontsource/inter/`.
- `frontend/index.html` — hapus 3 `<link>` tags ke Google Fonts (`preconnect` + stylesheet).
- `frontend/package-lock.json` — regenerasi via `node:20-alpine` untuk Docker `npm ci` compatibility.

### Tidak Diubah
- **nginx CSP header** tetap ketat (`style-src 'self' 'unsafe-inline'`, `font-src 'self'`) — tidak ada perubahan di `nginx/nginx.conf`, `nginx/nginx.ssl.conf`, atau `frontend/nginx.conf`.
- **Tailwind config** tetap `sans: ['Inter', 'system-ui', 'sans-serif']` — `@fontsource/inter` mendaftarkan `font-family: 'Inter'` via `@font-face`.

### Verification
- Frontend build: `npm run build` sukses — font files ter-bundle sebagai aset lokal.
- Frontend lint: 0 warnings.
- Frontend tests: 73/73 pass (24 test files).

## Session 25 — Fullstack Code Review Fixes (2026-07-05)

### Security
- **MaintenanceGuard fail-closed on invalid tokens**: Invalid/expired JWT on a public non-allowlisted route now returns 503 (maintenance) instead of silently allowing through. Uses `Reflector` to read `IS_PUBLIC_KEY` and distinguish public from protected routes before applying maintenance logic. Prevents bypass of maintenance mode via unauthenticated requests to non-allowlisted public routes.
- **UsersService.delete() revocation after delete**: `user.deleted` event emission moved after successful `transactionDelete()` so refresh-token revocation runs only when the user is actually deleted. Failures surface explicitly instead of being swallowed.
- **MaintenanceGuard Redis in-memory cache**: 2-second in-memory cache + `mget` for `maintenance:enabled`/`maintenance:message` reduces per-request Redis round-trips.

### Fixed
- **JwtStrategy error handling**: Repository failures (DB outage, restore) now return `UnauthorizedException` (401) instead of 500. Explicit `let user: Awaited<ReturnType<...>>` type annotation for clarity.
- **Ticket pagination empty-page bug**: `totalPages` now returns `1` (not `0`) when `total === 0` across all paginated repositories (tickets, users, notifications).
- **Dashboard cache resilience**: `DashboardService` Redis operations wrapped in try/catch — cache failures fall back to uncached queries instead of crashing.
- **UsersService revocation on password change/deactivation**: `user.password_changed` and `user.deactivated` events now use `emitAsync()` so refresh-token revocation completes before the service call resolves.
- **ProtectedRoute fail-closed**: `ProtectedRoute` now redirects to login when user is `null` (not just `undefined`), preventing unauthenticated render.
- **App query client isolation**: `frontend/src/lib/app-initializers.ts` provides `createAppQueryClient()` factory so each React tree gets its own TanStack Query cache (fixes test isolation issues).
- **Theme bootstrap before React**: `applyInitialTheme()` reads persisted `pref`/`mode` shape from Zustand and applies theme before first React render, preventing flash.
- **Notification unread-count invalidation**: `useNotifications()` hook now invalidates `unread-count` on window focus, ensuring the badge stays accurate.
- **Pagination select ID uniqueness**: `useId()` generates unique `id`/`htmlFor` pairs so multiple `<Pagination>` instances on the same page no longer have colliding label-for bindings.
- **Modal accessibility**: Dialog uses `role="dialog"` with `aria-modal="true"`, focus trap cycles inside dialog, and `Escape` key closes the modal.
- **TicketList a11y**: Sort buttons use `<button>` elements (not `<div>`) for keyboard navigation and proper ARIA attributes.
- **MyAccountPage Telegram dirty state**: Config save response now resets dirty state.
- **SPA 404 on refresh**: Nginx `try_files` fallback added so deep-link refreshes serve `index.html` instead of 404.

### Changed
- **API port topology**: Default `docker-compose.yml` no longer binds the API port to the host. Local debugging uses `docker-compose.debug.yml` override (`127.0.0.1:3000`). Production traffic always goes through Nginx.
- **Backup lock heartbeat**: `scripts/backup.sh` acquires `maintenance:backup:lock` in Redis and renews every 120s via a background heartbeat. Lock is token-matched so concurrent backup/restore cannot take over each other's lock. Cleanup on exit via trap.
- **CI workflow**: `.github/workflows/ci.yml` added — backend build+test+audit, frontend lint+build+test+audit on PRs and main pushes.
- **Container image pinning**: All Dockerfiles and Compose files now use digest-pinned base images (`node:20-bookworm-slim`, `nginx:1.25-alpine`, `postgres:16-alpine`, `redis:7-alpine`).
- **Nginx CSP hardening**: Added `object-src 'none'` to both `nginx.conf` and `nginx.ssl.conf` to block Flash/Java plugin loads.
- **Dockerfile chown scope**: Backend entrypoint chown narrowed from `/app` to `/app/uploads` and `/app/backups` only.
- **Backup artifact permissions**: `scripts/backup.sh` sets `chmod 600` on backup files and `chmod 700` on backup directories.

### Files Changed (backend)
- `backend/src/common/guards/maintenance.guard.ts` — Reflector injection, public-route bypass, in-memory cache.
- `backend/src/common/guards/maintenance.guard.spec.ts` — invalid-token public route test.
- `backend/src/auth/strategies/jwt.strategy.ts` — explicit user type, try/catch repository lookup.
- `backend/src/auth/strategies/jwt.strategy.spec.ts` — **new** — 4 tests for token type, missing user, inactive user, repo failure.
- `backend/src/users/users.service.ts` — `emitAsync()` for revocation, delete catch separation.
- `backend/src/users/users.service.spec.ts` — **new** — lifecycle tests including revocation after delete.
- `backend/src/tickets/tickets.service.ts` — `Math.ceil(total / limit) || 1`.
- `backend/src/tickets/__tests__/tickets.service.spec.ts` — empty-page total test.
- `backend/src/dashboard/dashboard.service.ts` — Redis cache try/catch best-effort.
- `backend/src/notifications/notifications.service.ts` — paginated `totalPages || 1`.
- `backend/src/maintenance/maintenance.service.ts` — lock renewal token matching + try/finally.
- `backend/src/maintenance/maintenance.service.spec.ts` — lock renewal tests.
- `backend/src/app.module.ts` — MaintenanceGuard factory Reflector injection.
- `backend/Dockerfile` — narrowed chown to uploads/backups.
- `scripts/backup.sh` — lock heartbeat + chmod 600 + SIGKILL resilience.

### Files Changed (frontend)
- `frontend/src/auth/ProtectedRoute.tsx` — fail-closed null-user redirect.
- `frontend/src/auth/__tests__/ProtectedRoute.test.tsx` — **new** — null-user regression tests.
- `frontend/src/lib/app-initializers.ts` — `createAppQueryClient()` + `applyInitialTheme()`.
- `frontend/src/main.tsx` — wired to app-initializers.
- `frontend/src/hooks/use-notifications.ts` — unread count window-focus invalidation.
- `frontend/src/components/ui/Modal.tsx` — dialog semantics + focus trap.
- `frontend/src/components/ui/Pagination.tsx` — `useId()` unique select IDs.
- `frontend/src/components/tickets/TicketList.tsx` — Link + button sort headers.
- `frontend/src/pages/MyAccountPage.tsx` — Telegram config dirty reset.
- `frontend/src/index.css` — SPA 404 Nginx fallback documented in comments.
- `frontend/src/test/setup.ts` — jsdom localStorage support.
- `frontend/vite.config.ts` — jsdom localStorage support.

### Files Changed (ops)
- `docker-compose.yml` — removed API port from default.
- `docker-compose.debug.yml` — **new** — local debug port override.
- `nginx/nginx.conf` — SPA fallback + `object-src 'none'`.
- `nginx/nginx.ssl.conf` — `object-src 'none'`.
- `.github/workflows/ci.yml` — CI pipeline.

### Verification
- Backend: 340/340 tests pass, build clean.
- Frontend: 73/73 tests pass, lint clean, build clean.
- Full code review v2: all findings resolved (3 Important + 8 Minor).

## Session 24 — Bugfixes (2026-07-04)

### Fixed
- **Dashboard Analytics overflow**: Ticket Trend bar chart with 90d range created too many flex items; rotated date labels pushed the page width beyond the viewport. Fixed by adding `overflow-x-auto min-w-0` to the trend container and `min-w-0` to each bar item so the chart scrolls horizontally when needed.
- **FaqManager `displayOrder` reset to 0 on toggle active**: `PartialType(CreateFaqDto)` inherited default value `= 0` for `displayOrder`. When the frontend sent `PATCH /faqs/:id { isActive: false }` (no `displayOrder`), the DTO instantiated with `displayOrder: 0` before body mapping, causing Prisma to overwrite the original value. Fixed by removing default values from `CreateFaqDto`, adding `@IsOptional()`, and moving defaults to service layer (`displayOrder ?? 0`, `isActive ?? true`).

### Files Changed
- `frontend/src/components/dashboard/AnalyticsSection.tsx` — add overflow guard to trend chart.
- `backend/src/faqs/dto/create-faq.dto.ts` — remove default values, add `@IsOptional()`.
- `backend/src/faqs/faqs.service.ts` — apply defaults at creation only.
- `backend/src/faqs/__tests__/create-faq.dto.spec.ts` — update default test.
- `backend/src/faqs/__tests__/faqs.service.spec.ts` — add partial-update regression test.

### Verification
- Backend: 321/321 tests pass.
- Frontend: 62/62 tests pass, build clean, lint clean.

## Session 23 — Blue Operations Frontend Redesign (2026-07-04)

### Changed
- Frontend visual system migrated from slate-dominant tokens to a **Blue Operations** palette: royal-blue primary actions, navy/blue-black dark surfaces, blue-tinted light surfaces, and sky/cyan accents.
- Login page redesigned as an **Enterprise Portal — Support Assist** experience with a polished `SH` brand mark, secure access header, compact form area, support cards, and FAQ panel.
- App shell, shared UI components, dashboard, ticket, admin, account, notification, and maintenance pages restyled to the Blue Operations palette while preserving existing behavior and role access rules.
- Default neutral badge/status helper styling now uses blue/navy neutral classes instead of slate classes.
- Test output cleaned up by opting test `MemoryRouter` instances into React Router future flags and wrapping Zustand auth-store test updates in `act()`.

### Fixed
- Restored global `.card-body` utility (`@apply p-6`) after the redesign migration. Dashboard and ticket detail cards still use this helper for spacing; removing it caused dashboard/card layouts to appear broken.

### Files Changed (frontend highlights)
- `frontend/tailwind.config.js` — added/updated `primary`, `navy`, and `surface` palettes.
- `frontend/src/index.css` — updated global body/button/input/card classes and restored `.card-body`.
- `frontend/src/components/ui/BrandMark.tsx` — **new** reusable polished `SH` mark.
- `frontend/src/pages/LoginPage.tsx` — redesigned login portal.
- `frontend/src/components/ui/FaqSection.tsx` — added `variant="portal"` support.
- `frontend/src/layout/{Layout,Sidebar,Navbar}.tsx` — migrated app shell to navy/blue surfaces.
- `frontend/src/components/{ui,dashboard,tickets,admin,account}` and `frontend/src/pages/*` — migrated neutral slate styling to Blue Operations tokens.
- New/updated tests: `BrandMark`, `Badge`, `LoginPage`, `utils-theme`, `global-styles`, `SlaStatusBadge`, router tests, and category hook tests.

### Verification
- Frontend lint: ESLint no issues.
- Frontend tests: 62/62 tests pass across 21 files with no React Router future flag or `act()` warnings.
- Frontend build: `tsc && vite build` passes.

## Session 22 — Landing Page Removal (2026-07-04)

### Removed
- Landing page feature (public landing page + admin editor) — feature dibatalkan.
- Backend: `landing-page` module, `LandingPageConfigRepository`, `LandingPageConfig` Prisma model.
- Frontend: `LandingPage` & `AdminLandingPagePage` pages, `components/landing/*`, admin forms, hooks, types, `landing-defaults.ts`.
- Route `/` sekarang redirect ke `/login`; route `/admin/landing-page` dihapus.
- DB: tabel `landing_page_config` di-drop via migration baru.

### Changed
- Sidebar admin: entry "Landing Page" dihapus.
- Dokumentasi (AGENTS, README, ARCHITECTURE) dibersihin dari referensi landing page.

## Session 21 — Landing Page

### Feature
- Public landing page at `/` for unauthenticated visitors — quick-action hub with hero, quick actions (submit ticket / check status → both route to login), contact info, FAQ accordion, and footer. Authenticated users redirect to `/tickets`.
- Admin editor at `/admin/landing-page` (Admin-only, sidebar entry) for contact info and FAQ management.
- Content stored in `LandingPageConfig` singleton DB table with two JSONB columns (`contact` + `faqs`), mirroring the `TelegramConfig` pattern.

### Backend Behavior Change
- New `LandingPageConfig` Prisma model: singleton (`key` column `@unique @default("default")`), `contact` JSONB (`{ email, phone, hours, location }`), `faqs` JSONB (`[{ id, question, answer, order, active }]`).
- New `landing-page` module: `LandingPageController`, `LandingPageService`, `LandingPageConfigRepository`.
- `GET /api/landing-page/content` is `@Public()` — returns active FAQs only, sorted by `order`.
- `GET /api/landing-page/content/admin` (Admin) — returns all FAQs including inactive.
- `PUT /api/landing-page/content` (Admin) — accepts partial updates: `{ contact? }` merges onto existing, `{ faqs? }` replaces the entire array. Service generates UUID `id` for entries missing one, validates uniqueness, sorts by `order`.
- Reads use `findUniqueByKey()` (not `findOrCreate()`) to avoid bumping `updatedAt` on every public page load. `findOrCreate()` is only used in `updateContent()` to ensure the row exists before updating.
- `updateContent()` uses the `update()` return value directly instead of making a redundant `getContent()` call.

### Files Changed (backend)
- `backend/prisma/schema.prisma` — tambah `LandingPageConfig` model.
- `backend/prisma/migrations/20260704120000_add_landing_page_config/migration.sql` — **new** — `CREATE TABLE "landing_page_config"`.
- `backend/src/common/repositories/landing-page-config.repository.ts` — **new** — singleton repository (mirrors `TelegramConfigRepository`).
- `backend/src/common/repositories/__tests__/landing-page-config.repository.spec.ts` — **new** — 7 unit tests.
- `backend/src/common/repositories/repositories.module.ts` — register `LandingPageConfigRepository`.
- `backend/src/landing-page/landing-page.module.ts` — **new**.
- `backend/src/landing-page/landing-page.controller.ts` — **new** — `@Public()` GET + Admin PUT/GET endpoints.
- `backend/src/landing-page/landing-page.service.ts` — **new** — content read/write, FAQ normalization, UUID generation, duplicate detection.
- `backend/src/landing-page/dto/update-contact.dto.ts` — **new** — contact fields validation.
- `backend/src/landing-page/dto/faq-entry.dto.ts` — **new** — FAQ entry validation (includes optional `id`).
- `backend/src/landing-page/dto/update-landing-page-content.dto.ts` — **new** — composed update DTO.
- `backend/src/landing-page/__tests__/landing-page.service.spec.ts` — **new** — 11 unit tests.
- `backend/src/landing-page/__tests__/update-landing-page-content.dto.spec.ts` — **new** — 21 DTO validation tests.
- `backend/src/app.module.ts` — import `LandingPageModule`.

### Files Changed (frontend)
- `frontend/src/types/index.ts` — added `LandingContact`, `FaqEntry`, `LandingPageContent`, `UpdateLandingPageContentPayload`.
- `frontend/src/lib/constants.ts` — added `STALE_TIME_LANDING_PAGE` (5 min), `STALE_TIME_LANDING_PAGE_ADMIN` (30s).
- `frontend/src/lib/landing-defaults.ts` — **new** — static fallback content.
- `frontend/src/hooks/use-landing-page.ts` — **new** — `useLandingPageContent()` (public, `enabled: !isAuthenticated`) and `useLandingPageAdminContent()` (admin).
- `frontend/src/hooks/use-update-landing-page.ts` — **new** — mutation hook with cache invalidation and `toast.error` on failure.
- `frontend/src/hooks/__tests__/use-landing-page.test.tsx` — **new** — 2 hook tests.
- `frontend/src/hooks/__tests__/use-update-landing-page.test.tsx` — **new** — 2 hook tests.
- `frontend/src/components/landing/Hero.tsx` — **new**.
- `frontend/src/components/landing/QuickActions.tsx` — **new**.
- `frontend/src/components/landing/ContactInfo.tsx` — **new**.
- `frontend/src/components/landing/FaqSection.tsx` — **new** — accordion with expand/collapse.
- `frontend/src/components/landing/LandingFooter.tsx` — **new**.
- `frontend/src/pages/LandingPage.tsx` — **new** — auth redirect + fallback content on API failure.
- `frontend/src/pages/__tests__/LandingPage.test.tsx` — **new** — 4 component tests.
- `frontend/src/components/admin/LandingContactForm.tsx` — **new** — contact form with dirty guard.
- `frontend/src/components/admin/LandingFaqEditor.tsx` — **new** — FAQ editor with add/edit/delete/reorder/toggle-active, "Save All FAQs".
- `frontend/src/pages/AdminLandingPagePage.tsx` — **new** — admin editor page.
- `frontend/src/pages/__tests__/AdminLandingPagePage.test.tsx` — **new** — 2 component tests.
- `frontend/src/App.tsx` — root route `/` → `LandingPage` (replaces redirect to `/tickets`); add `/admin/landing-page` route.
- `frontend/src/layout/Sidebar.tsx` — add "Landing Page" nav item for Admin.

### Code Review Fixes
- **Critical**: `FaqEntryDto` missing `id` property — `forbidNonWhitelisted` rejected FAQ saves with 400. Fixed by adding optional `id` field to DTO.
- **Important**: `updateContent()` used redundant `getContent()` call — fixed to use `update()` return value directly.
- **Important**: Cross-form reset — admin forms now use dirty guards in `useEffect` to prevent unsaved changes being overwritten when the other form's save invalidates the shared query cache.
- **Minor**: Reads use `findUniqueByKey()` instead of `findOrCreate()` to avoid bumping `updatedAt` on every public page load.
- **Minor**: `useLandingPageContent()` has `enabled: !isAuthenticated` to skip API call for authenticated users.
- **Minor**: `handleAdd` uses `Math.max(...orders, -1) + 1` for new FAQ order to prevent duplicates.
- **Minor**: `AdminLandingPagePage` retry uses `refetch()` instead of `window.location.reload()`.

### Verification
- Backend: 333/333 tests pass, build clean.
- Frontend: 63/63 tests pass, build clean, lint 0 warnings.

## Session 20 — Notification Preferences per Role

### Feature
- Setiap user dapat memilih jenis notifikasi in-app yang ingin dilihat di notification panel.
- Toggle set disesuaikan per role: EndUser hanya melihat `ticket.created` dan `ticket.status.updated`; ITSupport dan Admin melihat ketiga event (`ticket.created`, `ticket.assigned`, `ticket.status.updated`).
- Default semua event aktif (`null`/absent = on); hanya `false` eksplisit yang mematikan.
- Filter diterapkan saat notifikasi dibuat (filter-at-creation), sehingga unread-count, list queries, dan WebSocket gateway tidak berubah.

### Backend Behavior Change
- `User` model mendapat column `notificationPreferences Json?` (nullable JSONB). `null` berarti semua event aktif.
- Shared util `notification-preference.util.ts`: `NOTIFICATION_EVENTS`, `getEventsForRole(role)`, `isEventEnabled(prefs, event)`, `normalizePreferences(prefs, role)`.
- `UserRepository` tambah `getNotificationPreferences(userIds)` dan `setNotificationPreferences(userId, prefs)`. `findSupportUsers()` sekarang juga mengembalikan `notificationPreferences`.
- `NotificationsService` handler (`handleTicketCreated`, `handleTicketAssigned`, `handleTicketStatusUpdated`) sekarang memeriksa `isEventEnabled()` sebelum membuat notifikasi.
- `GET /api/notifications/preferences` mengembalikan `{ preferences, availableEvents }` yang dinormalisasi per role.
- `PATCH /api/notifications/preferences` menerima `{ preferences: Record<string, boolean> }`, memvalidasi event yang diizinkan untuk role, dan menyimpan normalized result.

### Files Changed (backend)
- `backend/prisma/schema.prisma` — tambah `notificationPreferences Json?` ke `User` model.
- `backend/prisma/migrations/20260703071831_add_notification_preferences/migration.sql` — **new** — `ALTER TABLE "users" ADD COLUMN "notificationPreferences" JSONB;`.
- `backend/src/common/utils/notification-preference.util.ts` — **new** — shared util: events definition, role filtering, enable check, normalization.
- `backend/src/common/utils/__tests__/notification-preference.util.spec.ts` — **new** — 15 unit tests.
- `backend/src/common/repositories/user.repository.ts` — extended `findSupportUsers()`, added `getNotificationPreferences()` and `setNotificationPreferences()`.
- `backend/src/common/repositories/__tests__/user.repository.spec.ts` — added 3 tests for new methods.
- `backend/src/notifications/notifications.service.ts` — added `isEnabled()` helper, filter-at-creation in 3 handlers, added `getPreferences()` and `updatePreferences()` methods.
- `backend/src/notifications/__tests__/notifications.service.spec.ts` — **new** — 12 unit tests covering filter-at-creation and preference CRUD.
- `backend/src/notifications/dto/update-notification-preferences.dto.ts` — **new** — DTO with `@Transform` and `@IsObject`.
- `backend/src/notifications/notifications.controller.ts` — added `GET /preferences` and `PATCH /preferences` endpoints.

### Files Changed (frontend)
- `frontend/src/types/index.ts` — added `NotificationEventOption`, `NotificationPreferencesMap`, `NotificationPreferencesResponse`.
- `frontend/src/lib/constants.ts` — added `STALE_TIME_NOTIFICATION_PREFERENCES` (5 min).
- `frontend/src/hooks/use-notification-preferences.ts` — **new** — `useNotificationPreferences()` query hook and `useUpdateNotificationPreferences()` mutation hook.
- `frontend/src/hooks/__tests__/use-notification-preferences.test.tsx` — **new** — 2 hook tests.
- `frontend/src/components/account/NotificationPreferencesSection.tsx` — **new** — checkbox UI per available event with save/disable state.
- `frontend/src/components/account/__tests__/NotificationPreferencesSection.test.tsx` — **new** — 3 component tests.
- `frontend/src/pages/MyAccountPage.tsx` — renders `NotificationPreferencesSection` for all roles after profile header.

### Verification
- Backend: 286/286 tests pass, build clean.
- Frontend: 45/45 tests pass, build clean, lint clean.

## Session 19 — Balanced Dashboard

### Feature
- Dashboard untuk ITSupport/Admin sekarang memakai layout balanced: **Current Snapshot**, **Need Attention**, dan **Historical Analytics**.
- Current Snapshot menampilkan active tickets, open, in progress, SLA risk, dan unassigned secara real-time/current.
- Need Attention menampilkan maksimal 5 ticket per kategori: SLA Risk, Critical/High Priority, dan Unassigned. Item ticket langsung link ke `/tickets/:id`.
- Historical Analytics mendukung filter periode `7d`, `30d`, `90d`, dan custom date range.

### Backend Behavior Change
- `GET /api/dashboard/stats` sekarang menerima query `range=7d|30d|90d|custom` dengan `from`/`to` untuk custom range.
- Response dashboard berubah dari shape flat lama menjadi `{ current, attention, analytics }`.
- Cache dashboard naik ke key `dashboard:stats:v2:<range>` dengan TTL 30 detik. Event ticket tetap meng-invalidasi seluruh key `dashboard:stats:v2:*` via `RedisService.deleteByPattern()`.
- Query dashboard dipindahkan ke repository methods khusus di `TicketRepository`: current snapshot, attention tickets, range status/priority counts, range SLA stats, range avg resolution by category, dan top categories.

### Files Changed (backend)
- `backend/src/dashboard/dto/query-dashboard-stats.dto.ts` — **new** — validates dashboard range query params.
- `backend/src/dashboard/dashboard.controller.ts` — passes dashboard query DTO to service.
- `backend/src/dashboard/dashboard.service.ts` — v2 response shape, range resolution, per-range cache keys, attention serialization.
- `backend/src/common/repositories/ticket.repository.ts` — dashboard-specific query methods.
- `backend/src/dashboard/__tests__/dashboard.service.spec.ts` — 14 tests covering v2 cache/range behavior, validation, response shaping, attention cap/date serialization, and Redis invalidation failure handling.

### Files Changed (frontend)
- `frontend/src/types/index.ts` — structured dashboard types (`DashboardStatsQuery`, `DashboardCurrentSnapshot`, `DashboardAttention`, `DashboardAnalytics`, etc.).
- `frontend/src/hooks/use-dashboard.ts` — query-aware `useDashboardStats(query)` and `buildDashboardStatsPath()`.
- `frontend/src/hooks/__tests__/use-dashboard.test.tsx` — **new** — 3 hook/path tests.
- `frontend/src/components/dashboard/DashboardRangeFilter.tsx` — **new** — preset/custom range filter with toast validation.
- `frontend/src/components/dashboard/__tests__/DashboardRangeFilter.test.tsx` — **new** — 3 component tests.
- `frontend/src/components/dashboard/CurrentSnapshotCards.tsx` — **new**.
- `frontend/src/components/dashboard/NeedAttentionSection.tsx` — **new**.
- `frontend/src/components/dashboard/AnalyticsSection.tsx` — **new**.
- `frontend/src/components/dashboard/DashboardStats.tsx` — split into orchestration + focused sub-components.
- `frontend/src/pages/DashboardPage.tsx` — owns dashboard range state.

### Verification
- Backend dashboard focused tests: 14/14 pass; backend build: ✅.
- Frontend dashboard focused tests: 6/6 pass; frontend lint: ✅; frontend build: ✅.

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

## Session 49 — Final Polish: jwtSecret Lazy, AuditService async, Gae Cleanup (2026-07-07)

### Fixed (Minor)
- **`jwt.config.ts` `jwtSecret` constant causing test failures**: Replaced with lazy `getJwtSecret()` function that evaluates at call time (not module load time), allowing tests to set `process.env.JWT_SECRET` before calling. (`jwt.config.ts`)
- **`AuditService.logAndThrow()` synchronous — not awaiting `this.log()`**: Changed to `async` + `await` so exception audit entries are persisted before the throw. (`audit.service.ts`)
- **Unused `ThrottlerGuard` import in `app.module.ts`**: Removed — `AppThrottlerGuard` already replaces it. (`app.module.ts`)
- **`docker-compose.e2e.yml` missing `SEED_ON_START`**: Added so isolated E2E stack seeds users on startup. (`docker-compose.e2e.yml`)
- **`MaintenanceController` missing `@ApiBearerAuth()`**: Added so Swagger UI shows Bearer auth for Admin endpoints. (`maintenance.controller.ts`)
- **`auth.service.ts` still uses `process.env.JWT_SECRET!` in 3 places**: Left as-is because the `jwtSecret` constant approach conflicts with test module evaluation ordering. The startup `validateStartupEnv()` provides safety. Noted in `AGENTS.md`.

### Files Changed (5 files, +26/-13 lines)
- `backend/src/common/config/jwt.config.ts` — lazy getJwtSecret()
- `backend/src/common/services/audit.service.ts` — async logAndThrow
- `backend/src/app.module.ts` — removed ThrottlerGuard import
- `backend/src/maintenance/maintenance.controller.ts` — +@ApiBearerAuth()
- `docker-compose.e2e.yml` — +SEED_ON_START

### Verification
- Backend: build ✅, lint 0 errors ✅, tests 757/757 ✅ (72 suites)
- Backend E2E: 14/14 ✅
- Frontend: build ✅, tests 221/221 ✅
- Swagger: /api/docs ✅
- **TG-02**: Schema migration `20260626000000_add_telegram_config_singleton_key` tambah `key String @unique @default("default")` ke `TelegramConfig`.
- **OPS-04 lock**: Tambah `acquireLock()`/`releaseLock()` helpers dengan random token ke `MaintenanceService`.
