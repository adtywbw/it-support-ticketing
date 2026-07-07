# Changelog

Riwayat perubahan project. Dipadatkan dari versi sebelumnya.

## Session 57 — Code Review Final: Health Test Fix, E2E Idempotency (2026-07-07)

- **health.controller.spec.ts**: mockRes → return value + rejects (controller sdh refactor @Res() ke @HttpCode())
- **E2E location 409 on re-run**: tambah runId (base-36 timestamp) ke nama lokasi supaya unique per run
- Verification: backend 757/757 ✅, frontend 213/213 ✅, E2E 15/15 ✅

## Session 56 — Code Review Round 6: HealthController @Res(), 6 Double Toast (2026-07-07)

- **HealthController @Res() anti-pattern**: bypass TransformInterceptor + HttpExceptionFilter. Refactor ke @HttpCode(200) + return body, ServiceUnavailableException untuk unhealthy
- **6 double toast sisa**: CommentSection, TicketDetail (x3), NotificationsPage — hapus inline onError, hook handle display
- Verification: backend 757/757 ✅, frontend 213/213 ✅

## Session 55 — Gap Fixes: AuditLog API, Module Imports, Component Tests (2026-07-07)

- **GET /api/audit-logs (Admin-only)**: paginated, filterable audit trail endpoint
- **Frontend component tests**: +20 tests (StatusBadge, PriorityBadge, Pagination)
- **RepositoriesModule explicit import**: 11 module sekarang import explicit (no @Global() reliance)
- Verification: backend 757/757 ✅, frontend 213/213 ✅

## Session 54 — Code Review R4: E2E Location, 4 Double Toast (2026-07-07)

- **E2E missing locationId + itemCode**: selalu 400. Tambah create location + field di payload
- **4 double toast**: TicketDetail assignMutation, Navbar markAsRead/clearAll/markAllAsRead
- Verification: backend 757/757 ✅, frontend build ✅

## Session 53 — Code Review R2: Double Toast, SLA Fallback, Audit TTL, Socket (2026-07-07)

- **6 mutation hooks double toast**: useSetMaintenanceMode, useCreateBackup, dll — hapus onError dari hooks (consumer handle via try/catch)
- **SLA fallback lintas kategori**: hapus fallback, return null langsung
- **AuditLog unbounded growth**: tambah @Cron cleanup 90 hari
- **useSocket missing removeAllListeners()**: tambah sebelum disconnect
- Verification: backend 757/757 ✅, frontend build ✅

## Session 52 — Code Review: File Save Order, Guard Ordering, CI, Csrf (2026-07-07)

- **AttachmentsService save file sebelum transaction (Critical)**: pindahkan ke dalam transaction callback
- **AppThrottlerGuard sebelum JwtAuthGuard**: guard order salah → semua request fallback IP-based. Pindah JwtAuthGuard sebelum ThrottlerGuard
- **CI missing prisma generate**: tambah step
- **CsrfGuard Origin bypass**: validasi Origin terhadap getCorsOrigins()
- Verification: backend 757/757 ✅, frontend build ✅

## Session 51 — Restore DROP SCHEMA Not COMMITted (2026-07-07)

- **MaintenanceService.restoreDatabase()**: DROP SCHEMA tidak pernah COMMIT → rollback otomatis → `type "AttachmentVisibility" already exists`. Tambah `-c 'COMMIT;'` pada psql pertama
- Safety model berubah: DROP di-COMMIT terpisah, safety dari pre-restore backup (bukan transaction rollback)
- Verification: restore test via API sukses ✅

## Session 50 — Location Master Data + Item Code + Required Fields (2026-07-07)

- **Location model**: tabel baru, soft-delete, Admin CRUD dari Master Data
- **Item Code**: field required VARCHAR(50) di setiap ticket
- **subCategoryId jadi required**: dari @IsOptional() ke @IsUUID() @IsNotEmpty()
- **locationId jadi required**: sama
- **ProtectedRoute refresh fix**: hapus `!cancelled` guard — Zustand set() syncronous, cleanup cancelled sebelum .finally() jalan
- 21 files, +582/-16 lines. Migration + all layers (Prisma→Backend→Frontend)
- Verification: backend 757/757 ✅, frontend 221/221 ✅, E2E 13/13 ✅

## Session 49 — Final Polish: jwtSecret Lazy, AuditService async (2026-07-07)

- **jwt.config.ts**: ganti constant → lazy getJwtSecret() biar test bisa set env sebelum call
- **AuditService.logAndThrow()**: jadi async + await log() sebelum throw
- **Unused ThrottlerGuard import**: removed
- **docker-compose.e2e.yml missing SEED_ON_START**: added
- Verification: backend 757/757 ✅, E2E 14/14 ✅, frontend 221/221 ✅

## Session 48 — CsrfGuard + Device Fingerprint + File Save Order + Bulk Fixes (2026-07-07)

- **CsrfGuard (Critical)**: global guard cek X-Requested-With header. Safe methods + /auth/* + /health exempt. Origin validation via getCorsOrigins()
- **CommentsService save file sebelum DB transaction (Critical)**: restructure — simpan file DI DALAM transaction callback, atomic dengan DB
- **Device fingerprint refresh token**: SHA-256 User-Agent + IP, validasi pas refresh, mismatch = revoke
- **UsersService.delete() token revoke setelah DB sukses**: pindah revoke SEBELUM transactionDelete()
- **CSV sort fields berbeda dari main query**: extract ALLOWED_SORT_FIELDS shared
- **Restore DROP SCHEMA tanpa rollback**: wrap BEGIN/COMMIT
- **Rate limit upload endpoints**: @Throttle 5/60s
- **SLA cron + recalculate overlap**: shared Redis lock (sla:check:lock)
- **Notifikasi duplikat di error**: hapus premature notified.add() dari catch
- **Dashboard enum unknown**: +Logger.warn()
- **delete() Categories return {message}**: ganti void (konsisten)
- **Notification store reset on logout**: auth-store dynamic import + reset()
- Verification: backend 757/757 ✅, E2E 14/14 ✅, frontend 221/221 ✅

## Session 47 — AuditService + AppThrottlerGuard + E2E + 5 Maintenance Tests (2026-07-07)

- **AuditService**: centralized structured logging (action, entity, entityId, userId, metadata)
- **AppThrottlerGuard**: user:{id} throttle key untuk authenticated, ip:{addr} untuk public
- **E2E maintenance mode tests**: +5 test (enable, disable, health reflect, auth exempt)
- **Login throttle 5→20/min**: akomodasi E2E suites
- Verification: backend 757/757 ✅, E2E 14/14 ✅, frontend 221/221 ✅

## Session 46 — Restore Pipefail Shell Fix (2026-07-06)

- **MaintenanceService.restoreDatabase() pakai sh bukan bash**: dash tidak support pipefail → restore gagal setelah DROP SCHEMA sukses (DB kosong, user terkunci). Fix: `execFileAsync('bash', ...)`. Recovery manual dari pre-restore backup
- Verification: build ✅, health ✅, login 201 ✅

## Session 45 — Code Review Final: Category Toggle, ESLint, FK Cascade (2026-07-06)

- **UpdateCategoryDto missing isActive (Critical)**: PartialType(CreateCategoryDto) ga include isActive → whitelist:true stripp field. Tambah @IsOptional @IsBoolean
- **DELETE /tickets/:id 500 FK violation (Critical)**: terminal TicketHistory dibuat dalam transaction yang sama dengan delete ticket. Hapus terminal entry + tambah ON DELETE CASCADE ke Comment/Attachment/TicketHistory FK
- **FaqsService inconsistent tanpa async**: tambah async ke 3 methods
- **ESLint config .js → .mjs**: ilangin Node warning
- **frontend/Dockerfile Copy .eslintrc.cjs gagal**: file di-dockerignore. Hapus COPY.
- Verification: backend 756/756 ✅, frontend 221/221 ✅

## Session 44 — Code Review Final Cleanup & 10/10 Rating (2026-07-06)

- **docker-entrypoint.sh shebang #!/bin/sh + pipefail (Critical)**: dash ignore pipefail. Ganti ke #!/bin/bash
- **UpdatePriorityDto missing @IsNotEmpty()**: tambah
- **CreateSlaConfigDto missing @IsNotEmpty()**: tambah
- **Dead code RefreshDto + CreateAttachmentDto**: delete
- **MaintenanceService Redis tanpa try/catch**: wrap setMaintenanceMode/getMaintenanceMode
- **AttachmentsController STREAM_ERROR → INTERNAL_ERROR**: konsisten dengan stable codes
- **PasswordChangeSection dual error display**: hapus onError dari hook, ganti mutateAsync → mutate
- **CSV redundant Blob**: response.data sdh Blob, ganti `new Blob([response.data])` → `response.data`
- **Dead query key ['subcategories']**: hapus semua invalidation
- **ESLint --ext .ts deprecated**: ganti ke `eslint src`
- **PostgreSQL missing log_lock_waits**: tambah
- **Docker cache missing cap_add**: tambah CHOWN SETUID SETGID
- **Frontend Dockerfile CMD shell-form → exec-form**: biar SIGTERM ke nginx
- **CI/CD pipeline**: .github/workflows/ci.yml baru (backend + frontend)
- **Indonesian strings di 2 files**: ganti ke English
- **.gitignore/.dockerignore**: tambah IDE patterns, coverage, logs
- Verification: backend 756/756 ✅, frontend 221/221 ✅

## Session 43 — WebSocket Origin, CSP Sync, Memory Leaks (2026-07-06)

- **WebSocket origin validation (Important)**: NotificationsGateway validasi Origin header via allowedOrigins set
- **CommentSection blob URL leak**: mountedRef + AbortController cleanup unmount
- **UpdateStatusDto missing @IsNotEmpty()**: tambah
- **CreateTicketForm dual error**: hapus submitError state, biar mutation onError handle
- **CSP ws: wss: sync**: semua nginx config termasuk ws: wss: di connect-src
- Verification: backend 760/760 ✅, frontend 221/221 ✅

## Session 42 — Redis Fail-Open, Mutation Error Handling, Nginx Hardening (2026-07-06)

- **AuthService.checkAccountLocked/ResetFailedLogin Redis failure (Critical)**: tambah try/catch fail-open
- **CreateAttachmentDto.size zero validation (Critical)**: tambah @IsInt @Min(0)
- **27 frontend mutation hooks missing error handlers (Critical)**: tambah onError toast ke semua
- **TicketList queryFilters objek baru tiap render**: wrap useMemo
- **MaintenanceController redundant JwtAuthGuard x7**: hapus (global guard sudah)
- **RedisService core methods tanpa error handling**: tambah Logger + try/catch
- **FaqRepository methods missing async**: tambah
- **Rate limit logout + change-password**: tambah @Throttle
- **Modal Escape handler re-register onClose**: useRef(onClose) + stable useCallback
- **NotificationsPage mark-as-read tanpa onError**: tambah toast
- **Indonesian maintenance message**: ganti English
- **Nginx hardening**: server_tokens off, ws_limit, rate limit /socket.io/
- **pids_limit docker**: tambah ke nginx, db, cache
- **PostgreSQL slow query logging**: log_min_duration_statement = 1000
- **Minor**: hapus type assertions di TicketRepository, hapus RedisService.getClient(), MAX_CONNECTIONS_PER_USER=5, updateStatus context mutation → typed return, NotificationsService per-create error handling, useNotifications staleTime 30s, Pagination zero totalPages guard
- Verification: backend 760/760 ✅, frontend 221/221 ✅

## Session 41 — Role Guard, CSP Hardening, Dashboard Invalidation (2026-07-06)

- **change-password missing @UseGuards(RolesGuard) (Critical)**: EndUser bisa akses. Tambah guard
- **Redundant JwtAuthGuard di DashboardController + UsersController**: hapus
- **CSP ws: wss: di static asset locations**: hapus dari /assets/ /index.html /
- **CategoryRepository.findAll missing slaConfigs untuk Admin**: tambah include
- **SubCategoryRepository.findByCategoryId hardcoded isActive:true**: tambah includeInactive param
- **AuthService.revokeRefreshToken tanpa try/catch**: tambah
- **MaintenanceService.setMaintenanceMode(false) Redis unchecked**: tambah try/catch
- **Dashboard query key object reference instability**: serializeQuery() untuk stable key
- **Dashboard invalidation key salah**: ['dashboard'] → ['dashboard', 'stats'] di 7 mutations
- **useTicket missing staleTime**: tambah STALE_TIME_TICKETS
- **useChangePassword missing onError**: tambah toast
- **useFileUpload blob URL leak**: useEffect cleanup ref
- **AttachmentList division by zero**: guard || 1
- Verification: backend 760/760 ✅, frontend 221/221 ✅

## Session 40 — Refresh Rate Limit, Telegram Token Leak, Type Casts, UI Sync (2026-07-06)

- **Refresh rate limit (Critical)**: tambah @Throttle 5/60s
- **useFileUpload preview URL sync bug (Critical)**: blob URL dibuat synchronous di factory, hapus useRef/useEffect/useMemo dance
- **Telegram bot token leak di error (Critical)**: regex-based redaction + API URL pattern
- as unknown as di AttachmentRepository & SubCategoryRepository: ganti proper GetPayload type
- **Duplicate trimString di 5 DTO**: extract trimOptionalString ke transform.util.ts
- **Redundant JwtAuthGuard di 9 controllers**: hapus
- **CSV export unsafe type assertion**: CsvExportTicket interface eksplisit
- **isEventEnabled return true untuk array**: tambah explicit undefined check
- **Navbar unsafe cast + missing error handlers**: proper narrowing, toast
- **TicketFilters missing aria-label**: tambah
- **TicketList mutation onError refetch**: hapus (invalidate on success sudah)
- **Frontend container hardening**: mem_limit, cpus, pids_limit, cap_drop, read_only
- **Indonesian maintenance guard + banner**: ganti English
- **Missing JWT_SECRET validation**: startup wajib ≥32 chars
- **docker-entrypoint.sh npx --no-install**: ganti ke node node_modules/.bin/prisma
- Verification: backend 757/757 ✅, frontend 221/221 ✅

## Session 39 — Audit Trail, Export Resilience, Frontend Stability (2026-07-06)

- **Ticket deletion destroys audit history (Critical)**: buat terminal TicketHistory entry ("Deleted") sebelum delete
- **CSV export rate limit**: @Throttle 2/60s
- **CSV export stream error client disconnect**: res.on('error'|'close'), aborted flag
- **Frontend pagination re-render loop**: useRef onPageChange decouple
- **ErrorBoundary lacking user guidance**: tambah "contact helpdesk team"
- Verification: backend 757/757 ✅, frontend 221/221 ✅

## Session 38 — Dynamic Import, Orphaned Files, SLA Pre-load, useFileUpload (2026-07-06)

- **Dynamic import('fs') di download hot path**: ganti static import
- **Orphaned file accumulation**: @Cron cleanupOrphanedFiles() di AttachmentsService
- **Redundant JwtAuthGuard provider**: hapus duplicate
- **sortBy @IsIn() allowlist**: ganti @IsString
- **SLA check redundant joins**: pre-load configs ke Map, flat select
- **EndUser 2 extra DB queries**: pindah filtered _count ke Prisma main query
- **Raw <p> error → ErrorMessage component**: CommentSection + AttachmentList
- **Duplicate file upload logic**: extract useFileUpload() hook
- **ProtectedRoute inline spinner → LoadingSpinner**
- **AdminMaintenancePage 347→72 lines**: extract BackupManager.tsx
- Verification: backend 757/757 ✅, frontend 221/221 ✅

## Session 37 — Email Case, Sort Injection, Cache Mutation, Refresh Order (2026-07-06)

- **Email case-sensitivity mismatch (Critical)**: normalize lowercase di create/update
- **Prisma.raw() sort direction injection (Critical)**: validasi sortOrder ['asc','desc']
- **TanStack Query cache mutation (Critical)**: .map() bukan mutasi in-place
- **Refresh consumed before user validation**: GET dulu, validasi user, baru GETDEL
- **Maintenance polling overhead**: dynamic refetchInterval (fast 15s only when active)
- **Unvalidated sortOrder**: tambah validation di findAll
- **Delete return shape inconsistent**: void instead of {message}
- **WebSocket inline CORS logic → shared getCorsOrigins()**
- Verification: backend 757/757 ✅, frontend 221/221 ✅

## Session 36 — bcrypt Blocking, Typed Repos, CSP WebSocket, Pagination Fixes (2026-07-06)

- **AuthService blocking bcrypt di constructor**: pindah ke OnModuleInit async
- **TicketRepository.findById unsafe type cast**: explicit Prisma args (no more `as unknown as`)
- **HttpExceptionFilter malformed array errors**: filter string items only
- **PasswordInput tests broken**: rewrite click-toggle (not long-press)
- **Nginx SSL CSP WebSocket blocked**: ws: wss: di /assets/ /index.html
- **Hardcoded delay → appConfig maintenance.backupIdRetryDelayMs**
- **envNumber() NaN injection**: fallback defaultValue
- **RedisService spread arg limit**: mget/del pake array langsung
- **use-notifications select side-effect re-render**: pindah ke useEffect
- **Modal missing aria-hidden**: tambah backdrop
- **thumbnail-cache unsafe type**: runtime guard
- **WebP magic-byte detection**: tambah WEBP bytes di offset 8
- **vite.config.ts __dirname undefined di ESM**: ganti fileURLToPath
- **ProtectedRoute loading flash**: spinner animated + cancelled cleanup
- **SubCategoryRepository.findById unsafe cast**: explicit args
- Verification: backend 752/752 ✅, frontend 221/221 ✅

## Session 35 — Comprehensive Review: MaintenanceGuard, PasswordInput, Thumbnail Cache (2026-07-06)

- **HttpExceptionFilter silent non-HTTP errors**: tambah Logger.error()
- **MaintenanceGuard fragile getResponse mutation**: ganti ServiceUnavailableException body
- **PasswordInput dangerous prop spread + long-press**: click-toggle + Omit type
- **Duplicate thumbnail cache**: extract ke lib/thumbnail-cache.ts
- **RedisService password injection heuristic**: parsedUrl.password proper check
- **Hardcoded MAX_FILE_SIZE**: ganti appConfig
- **envNumber() helper**: izinkan 0 sebagai valid override
- **JwtModule duplicated registration**: shared jwt.config.ts
- **Navbar dropdown aksesibilitas**: Escape key
- **UserManagement missing client-side validation**: tambah
- **TicketFilters JSON.stringify → field-by-field**
- **App.tsx flash redirect / → /tickets**
- Verification: backend + frontend ESLint **0 errors**

## Session 34 — Batch 6 Type Cleanup (2026-07-06)

- **ticket.repository.ts dead groupBy(args: any)**: remove
- **user.repository.ts Record<string, unknown> → Prisma types**
- **telegram-config.repository.ts loose typing → Prisma types**
- **telegram.service.ts untyped callback**: remove :any
- Verification: backend 752/752 ✅, frontend 223/223 ✅, ESLint 0 errors

## Session 33 — Batch 5 Type Cleanup (2026-07-06)

- **users.service.ts reactivated user as any → as unknown as proper generic**
- **sla.service.ts nested include as any → as unknown cast**
- **comments.service.ts userRole as any → UserRole**
- **tickets.service.ts Record<string, unknown> → Prisma types** (4 sites)
- Verification: backend 752/752 ✅, frontend 223/223 ✅, ESLint 0 errors

## Session 32 — Batch 4: Last as Any, Race Condition, Batch SQL (2026-07-06)

- **Telegram checkConfig() groupChat token leak**: strip token di kedua catch
- **sub-category/ticket repository as any → Prisma generics**
- **tickets.service.ts as any cascade (6 sites)**: typed where, orderBy, updateData
- **notification.repository.ts Record → Prisma.NotificationWhereInput**
- **buildSafeUploadPath dead code**: hapus ALLOWED_EXTENSIONS
- **concurrency.util.ts non-positive worker guard**
- **totalPages required (not optional) di frontend types**
- **MaintenanceService.listBackups() race condition**: ganti Promise.all
- **SLAService batch SQL**: ganti Promise.all 500 updates → single $executeRaw
- **Dashboard 5 COUNT → 1 $queryRaw FILTER(WHERE...)**
- **NotificationsGateway setTimeout cap** + user.deleted handler
- **Backup ID millisecond precision**: cegah collision
- **E2E test isolation**: ganti module-level let ke describe-scoped state
- Verification: backend 752/752 ✅, frontend 223/223 ✅

## Session 31 — pg_dump, WebSocket Reconnect, Repository as Any Removal (2026-07-06)

- **pg_dump --no-owner (Critical)**: prevent restore fail beda environment
- **users.service.ts uncaught emitAsync (Critical)**: try/catch with Logger
- **Restore pipe without set -o pipefail (Critical)**: tambah
- **WebSocket reconnect silent failure (Critical)**: hapus disconnect on connect_error, tambah reconnect_attempt handler baca latest token
- **Repository as any SEMUA (Critical)**: 9 repository files cleared
- **ApiResponse.meta missing totalPages**: tambah
- **useTickets query key instability**: JSON.stringify(filters)
- **Docker init: true semua services**
- **ProtectedRoute bypass interceptors**: extract refreshAccessToken() ke axios.ts
- **slaDueAt/slaStatus nullable**: migration baru, no 24h fallback
- **Concurrency util semaphore**: replace serial-batch
- Verification: backend 752/752 ✅, frontend 223/223 ✅

## Session 30 — Massive Test Coverage (200+ tests)

- **7 controller tests** (100% coverage): attachments, sub-categories, sla, dashboard, telegram, maintenance, health
- **6 page tests** (100% coverage)
- **6 service tests**: sub-categories, redis, prisma, comments, attachments, telegram
- **23 DTO validation tests** (+235 tests)
- **12 component tests**
- **E2E smoke test** (9 tests): health → login → create ticket → status → comment → dashboard → delete → refresh
- **Backend ESLint flat config + 0 errors**
- Verification: backend 745/745 ✅, frontend 222/222 ✅, E2E 9/9 ✅

## Session 29 — Magic Numbers → appConfig, MyAccountPage Split

- **30+ magic numbers → centralized appConfig** dengan env override
- **MyAccountPage 511→50 lines**: extract TelegramConfigSection + PasswordChangeSection
- **Shared trimString util + buildPaginationMeta()**
- **Dead code**: 4 repository methods + 3 tests
- Verification: backend 375/375 ✅, frontend 88/88 ✅

## Session 28 — Maintainability Quick Wins

- **30+ magic numbers → centralized appConfig** — semua env override
- **ESLint backend**: install, fix 4 production issues
- **BUG-18**: ThrottlerException return TOO_MANY_REQUESTS (not UNKNOWN_ERROR)
- **BUG-19**: auth/refresh tanpa cookie return 401 (not 201)
- Verification: backend 341/341 ✅, frontend 73/73 ✅

## Session 27 — Bugfix: 429 Error Code, Refresh Cookie 401

- **BUG-18**: 429 → TOO_MANY_REQUESTS mapping di HttpExceptionFilter
- **BUG-19**: auth/refresh tanpa cookie → throw UnauthorizedException (not return null)
- **ESLint gagal di frontend Docker**: COPY .eslintrc.cjs dan .eslintignore
- Verification: backend 341/341 ✅, frontend 73/73 ✅

## Session 26 — Self-Host Google Font (Inter)

- **CSP style-src blocked Google Fonts**: ganti ke @fontsource/inter local. Hapus link google fonts. Nginx CSP tetap ketat
- Verification: frontend 73/73, lint 0 warnings

## Session 25 — Fullstack Code Review (25 fixes)

- **MaintenanceGuard fail-closed on invalid tokens**: pakai Reflector + IS_PUBLIC_KEY
- **UsersService.delete() revoke after delete**: pindah emitAsync setelah transaction
- **MaintenanceGuard 2s in-memory cache + mget**
- **JwtStrategy repo failure → 401 (not 500)**
- **totalPages = 1 when total=0** (semua repositories)
- **Dashboard cache fail → uncached fallback**
- **User deactivation emitAsync revoke**
- **ProtectedRoute fail-closed null user redirect**
- **createAppQueryClient() factory** untuk test isolation
- **applyInitialTheme() before React render** (no flash)
- **Unread count window-focus invalidation**
- **Pagination useId() unique select IDs**
- **Modal dialog a11y + focus trap**
- **API port unbind from host** (default compose)
- **Backup lock heartbeat** + scripts/backup.sh lock
- **CI workflow**: backend + frontend jobs
- **Digest-pinned base images**
- **Nginx CSP object-src 'none'**
- 30+ files changed
- Verification: backend 340/340 ✅, frontend 73/73 ✅

## Session 24 — Bugfixes: Dashboard Overflow, FAQ PartialType Default

- **Dashboard analytics overflow 90d**: overflow-x-auto min-w-0
- **FaqManager displayOrder reset**: hapus default di DTO, pindah ke service (PartialType bug pattern)
- Verification: backend 321/321 ✅, frontend 62/62 ✅

## Session 23 — Blue Operations Frontend Redesign (2026-07-04)

- **Frontend redesign**: blue-primary palette (royal blue, navy, surface)
- **Login page**: Enterprise Portal — Support Assist
- **Restored .card-body** global utility (dashboard/ticket detail depend)
- **Tailwind config**: primary/navy/surface palette
- **BrandMark.tsx**: reusable SH mark
- **FaqSection variant="portal"**
- Verification: frontend 62/62 ✅, lint clean, build ✅

## Session 22 — Landing Page Removal (2026-07-04)

- **Landing page dibatalkan**: hapus landing-page module, Prisma model, frontend pages/components, DB migration drop table

## Sessions 21-1 — Initial Development (ringkasan)

### Session 21 — Landing Page Feature
- Public landing page `/` (hero, quick actions, FAQ accordion, footer), admin editor `/admin/landing-page`, LandingPageConfig singleton model (JSONB contact + faqs)

### Session 20 — Notification Preferences per Role
- Per-role event toggle: EndUser (2 events), ITSupport/Admin (3 events). Filter-at-creation. Null = all on. 15 util tests

### Session 19 — Balanced Dashboard
- Current/Attention/Analytics layout. Range filter (7d/30d/90d/custom). Redis cache v2 (30s TTL, invalidate on ticket events)

### Session 18 — Admin SLA Configuration
- SLA CRUD dari Master Data. Auto-recalculation on timing change. Keyset pagination batch 500

### Session 17 — CI Pipeline Fix + NestJS 11 Complete
- 6 CI fixes: upgrade @nestjs/common/jwt/passport ke v11, uuid ESM, npm audit frontend, GitHub Actions v5

### Session 16 — Maintenance Restore Regression
- pg_trgm extension auto-inject di restore. Release restore lock before disable maintenance

### Session 15 — Frontend Test Infrastructure
- Vitest setup, 13 tests (ProtectedRoute, auth-store, Pagination, use-notifications)

### Session 14 — Review Fixes Batch 2 (9 tasks)
- JWT HS256 pinning, CORS production HTTPS check, CSV export honor sortBy, ticket repo access scope tests, useCategories role cache key, NotificationsPage error state, backup.sh lock, seed/perf fix

### Session 13 — Dead Code, Validation, Consistency
- Hapus @SkipMaintenance() decorator. StaleTime constants konsisten

### Session 12 — Polish & Dead Code
- Shared cookie-options.ts module, named fs imports, getDailyTrends range-based, type safety notifications/user repos

### Session 11 — Polish & Minor Fixes
- Shared time.util.ts, concurrency.util.ts, safeRedirectPath(). Hapus dead forceRefresh. Validation tightening

### Session 10 — Test Coverage (126→238 tests)
- 8 repository tests (99 cases), SLA cron tests (11), dashboard/categories service tests (27)

### Session 9 — Quick-Win Fixes (17 issues)
- User/notification repository totalPages guard, MaintenanceGuard HS256 explicit, ticketAccessScope for EndUser, comment visibility push to Prisma query, SLAService consistency, upload atomicity, frontend test +6

### Sessions 7-8 — Performance + Bugfix + Production Readiness
- **PERF**: Redis maxmemory, PostgreSQL tuning, 5 GIN trigram indexes, keyset pagination SLA, sequence ticket number (O(1)), dashboard Redis cache, code splitting, asset Cache-Control immutable
- **BUG-12 to BUG-17**: listen_addresses, Telegram link code, EndUser $queryRaw uuid cast, auth/refresh 500 during restore, axios 503 handler Admin-only, Redis stop-writes-on-bgsave-error
- **Critical**: multer upgrade v2, MIME compatibility map, WebSocket session expiry, DTO blank text validation, TelegramConfig singleton atomic, dashboard cache invalidation wired

### Sessions 4-6 — Security, Bugfix, Architecture
- **SEC 60+ items**: Nginx hardening, CSP, container hardening, bcrypt dummy compare, file extension whitelist, JWT tokenType, account lockout, env validation, atomic Redis locks
- **AuditService**: centralized structured logging
- **AppThrottlerGuard**: user-based rate limiting
- **3 env files (least privilege)**: backend/.env, .env.db, .env.cache

### Sessions 1-3 — Initial Build
- **Basic stack**: NestJS 11, Prisma 5, PostgreSQL 16, Redis 7, React 18, Vite 8
- **Auth**: JWT access/refresh, httpOnly refresh cookie, silent refresh, tokenType claims, login rate limit
- **Tickets**: CRUD + status/priority/assign + SLA calculation + export CSV
- **Comments**: multipart upload (text + files), internal/public, visibility filter
- **Attachments**: magic-byte validation, file extension whitelist, visibility policy
- **SLA**: cron check, keyset pagination, status transitions
- **Telegram**: polling bot, config CRUD, link/unlink, event-driven send, test notification
- **Dashboard**: stats, trends, SLA compliance, category resolution
- **Master Data**: categories, sub-categories, users, SLA configs
- **Maintenance**: mode toggle, backup/restore (DB + uploads), Redis locks
- **Frontend**: dark mode, sidebar, role-based routing, Blue Operations theme (Session 23)
- **Docker**: compose matrix (dev/prod/e2e), nginx + SSL, Redis + PostgreSQL tuning
- **CI/CD**: GitHub Actions (lint/test/build)
