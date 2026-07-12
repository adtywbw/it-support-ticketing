# Changelog

Riwayat perubahan project. Dipadatkan dari versi sebelumnya.

## Session 72 — Contextual Self-Service: FAQ Recommendations + Deflection Analytics (2026-07-12)

- **Feat: contextual FAQ recommendations (High)** — Up to 5 active FAQs suggested from category, subject, and keywords during ticket creation. Frontend `TicketSolutionSuggestions` component with session tracking (shown, opened, resolved) and debounced subject input.
- **Feat: FAQ metadata (High)** — Optional `categoryId` and `keywords` array on FAQ model. Admin FAQ manager updated with category select and keyword tags.
- **Feat: self-service interaction analytics (Medium)** — `faq_interactions` table stores privacy-safe session events (RecommendationsShown, ArticleOpened, ProblemResolved, TicketCreated). Admin-only `GET /api/faqs/analytics?range=30d` reports deflection rate, continuation rate, top FAQs, category opportunities. 180-day retention with @Cron cleanup.
- **Feat: ticket deflection linkage (Medium)** — `Ticket.selfServiceSessionId` links created tickets to self-service sessions. Analytics counts `continuedToTicketSessions` from linked tickets. `TicketCreated` events emitted server-side only (fail-open on error).
- **Test: E2E + a11y + regression coverage** — 5 new E2E tests (FAQ create, recommendations, analytics auth, linked ticket, cleanup). 1 new a11y test for `TicketSolutionSuggestions`. Full backend + frontend test passes.
- **Verification**: lint 0 errors ✅ | backend 824/824 tests ✅ | frontend 236/236 tests ✅ | build ✅

## Session 71 — Brand Rename: "Support Hub" → "IT HelpDesk" (2026-07-10)

- **Feat: Brand rename (High)** — Changed app name from "Support Hub" to "IT HelpDesk" across all surfaces:
  - BrandMark: replaced "SH" text with eye icon (responsive: black in light / white in dark except sidebar which always uses white)
  - Favicon: eye icon, black stroke on transparent background
  - Login page title, heading, and sidebar header updated
  - Browser tab title: "IT HelpDesk"
  - Backend Swagger title & description updated
- **Fix: BrandMark a11y (Medium)** — Added `role="img"` to fix `aria-prohibited-attr` violation in axe-core
- **Fix: Sidebar button overlap (Medium)** — Moved expand button to bottom of sidebar when collapsed to prevent overlap with BrandMark. Used cleaner chevron icons (Heroicons style)
- **Footer** — Updated to "© 2026 Aditya Wibowo. All rights reserved." (login page only, per enterprise best practice)
- **Docs**: AGENTS.md, README.md, ARCHITECTURE.md headers updated; changelog entry added
- **Verification**: lint 0 errors ✅ | 220/220 tests ✅ | frontend build ✅

## Session 70 — Code Review R6: Priority Notifications, Double Toast, Submission Guard (2026-07-09)

- **Feat: `ticket.priority.updated` notification (High)** — Added `@OnEvent` handler in `NotificationsService` for priority change events. Notifies both assignee and requester via in-app + WebSocket. Added to `NOTIFICATION_EVENTS` list as 4th event (all roles).
- **Feat: `ticket.priority.updated` Telegram listener (High)** — Added handler in `TelegramListener` for priority change events. Sends message with old/new priority to configured channels.
- **Fix: `ticket.priority.updated` emit payload** — Extended with `assignedToId`, `requesterId`, and `subject` to support notification handlers.
- **Fix: duplicate toast on priority/assign error (Medium)** — Removed inline `onError` from `TicketList` for `useUpdateTicketPriority` and `useAssignTicket`. Hooks already have `onError` — was violating AGENTS.md convention.
- **Fix: CreateTicketForm concurrent submission guard (Medium)** — Added `|| isPending` check to `handleSubmit` to prevent duplicate ticket creation on rapid double-click/Enter before mutation state updates.
- **Fix: GET /locations/:id role filtering (Low)** — Non-Admin users now only see `{ id, name }` instead of full object with `_count.tickets`.
- **Test: notification-preference tests updated** — All 10 affected tests updated for the new 4th event.
- **Verification**: lint 0 errors ✅ | 783/783 tests ✅ | frontend build ✅

## Session 69 — Code Review R5: Shutdown Fix, SSL Rate Limit, Bundle Optimization (2026-07-09)

- **Fix: `enableShutdownHooks()` order (Important)** — Moved BEFORE `app.listen()`. NestJS requires this order; calling after means SIGTERM handlers are never registered. Prisma `$disconnect()` and `@Cron` cleanup now work correctly on Docker stop.
- **Fix: nginx SSL `/api/maintenance/` rate limit (Important)** — Added `limit_req zone=api_limit burst=5 nodelay` to match HTTP config. Previous SSL config had no rate limit on maintenance endpoints, bypassing general `/api/` limit.
- **Perf: Vite vendor chunk splitting** — Added `manualChunks` splitting React/ReactDOM/Router (`vendor`), TanStack Query (`query`), and Socket.IO (`socket`). Main bundle reduced from 272KB → 131KB (52% reduction).
- **Refactor: `TicketsPage` lazy-loaded** — Converted from eager import to `lazy(() => import(...))` for consistency with all other pages. Now a separate 18KB chunk.
- **Docs: `MaintenanceController` PrismaService comment** — Added comment explaining direct Prisma injection for operational queries as intentional exception to repository pattern.
- **Fix: `GET /locations/:id` add `@CurrentUser()` for auth context** — Matches `GET /` pattern. Full data returned to all authenticated roles (low sensitivity).
- **Verification**: lint 0 errors ✅ | backend 783/783 tests ✅ | backend build ✅ | frontend lint 0 errors ✅ | frontend build ✅ (595ms)

## Session 68 — Code Review R4: Shutdown Hooks, Race Conditions, Test Coverage, SLA Reopen (2026-07-09)

- **Fix: graceful shutdown (Critical)** — Added `app.enableShutdownHooks()` in `main.ts`. Prisma and Redis connections now properly disconnect on SIGTERM, preventing connection leaks on deploy.
- **Fix: assignTicket race condition (Critical)** — Replaced read-before-write pattern with optimistic locking via `updateMany({ where: { id, assignedToId: oldId } })`. Concurrent assigns now throw `ConflictException` instead of silently overwriting. User validation moved inside transaction.
- **Fix: reopened ticket SLA recalculation (Important)** — Tickets reopened from Closed/Resolved to an active status now recalculate `slaDueAt` and `slaStatus` via `SLAService.getSLAConfig()`. Previously stayed null indefinitely.
- **Feat: pg_trgm GIN indexes** — Added `tickets_item_code_trgm_idx` and `locations_name_trgm_idx` for full-text search on itemCode and location name. (Ticket subject, description, ticketNumber, and user name/email indexes already existed from earlier migration.)
- **Feat: locations service tests** — 10 new tests covering CRUD, conflict detection, reactivation of inactive locations, and soft/hard-delete logic.
- **Feat: audit-logs tests** — 7 new tests covering pagination, filtering (action/entity/userId), and edge cases (totalPages for zero results). Controller test added.
- **Fix: useSocket cleanup** — Removed `removeAllListeners()` which stripped Socket.IO internal transport handlers. `disconnect()` alone is sufficient.
- **Fix: revokeRefreshToken debug log** — Added `logger.debug()` for invalid/unparseable tokens to aid troubleshooting.
- **Verification**: lint 0 errors ✅ | backend 783/783 tests (75 suites, +20 new) ✅ | backend build ✅ | frontend build ✅

## Session 67 — Code Review R3: SLA Performance, CSV Consistency, Telegram Resilience, Secret Validation (2026-07-09)

- **Perf: SLA config memoization** — `getActiveConfigKeys()` caches `findAllActive()` results with 30s TTL, avoiding a DB call on every ticket list/detail fetch. `stripStaleSlaValues()` uses memoized keys.
- **Fix: CSV export strips stale SLA values** — Added `stripStaleSlaValues()` call per CSV batch, consistent with list/detail endpoints. `CsvExportTicket` extended with `categoryId`/`slaDueAt` fields.
- **Fix: maintenance key TTL on restore** — Both `maintenance:enabled` and `maintenance:message` keys set with 1-hour expiry during restore. Prevents indefinite maintenance if process crashes before `setMaintenanceMode(false)`.
- **Fix: Telegram polling stops on permanent auth failure** — Tracks consecutive HTTP 401 responses; after 5 failures, stops polling with log message. Resets on `startBot()` or successful response.
- **Fix: weak secret detection normalization** — Strips non-alphanumeric characters before comparison to catch variants like `Change-This-To-Random-Secret`.
- **Fix: SVG accessibility** — Added `aria-hidden="true"` + `focusable="false"` to back-arrow SVG in `TicketDetailPage`.
- **Docs: AuditLog FK comment** — Added schema comment explaining no FK constraint (preserves audit trail after user deletion).
- **Config: ticket creation retries 3→5** — Reduces theoretical deadlock risk under extreme concurrency.
- **Docs: WebSocket expiry limitation** — Added comment in `scheduleExpiryDisconnect` explaining the ~1-2s notification gap on token refresh.
- **Verification**: lint 0 errors ✅ | 763/763 tests ✅ | build ✅ | E2E 36/36 (prod HTTPS) ✅

## Session 66 — Code Review Round 2: WebP Tests, HSTS Gap, Type Safety, Dead Code (2026-07-09)

- **Feat: WebP MIME unit tests** — 6 new tests covering valid WebP (zero and non-zero file sizes), buffer < 12 bytes, non-WebP RIFF (AVI), WebP accept, and spoofing rejection.
- **Fix: nginx ssl.conf /socket.io/ HSTS gap (Critical)** — Added `Strict-Transport-Security` header to `/socket.io/` location block for consistency with all other locations.
- **Refactor: remove unused `TicketSortField` type import** from `tickets.service.ts`. Removed redundant `sortBy`/`sortOrder` destructuring (×2) — values already provided by `buildTicketQueryInput()`.
- **Refactor: `stripStaleSlaValues` typed** — Replaced `tickets: any[]` with generic `<T extends { slaDueAt?, slaStatus?, categoryId, priority }>`.
- **Refactor: remove unused imports** — `stat` from `attachments.service.ts`, `Prisma` from `sla.service.ts`, `ExecutionContext` from `app-throttler.guard.ts`.
- **Security: noindex meta** — Added `<meta name="robots" content="noindex, nofollow">` to `frontend/index.html` to prevent search engine indexing of internal app.
- **Fix: axios URL comparison** — Added `startsWith("/api/auth/refresh")` / `startsWith("/api/auth/login")` guards alongside existing `!==` checks for robustness against base URL variations.
- **Verification**: backend lint 0 errors ✅ | backend 763/763 tests (24 WebP) ✅ | backend build ✅ | frontend lint 0 errors ✅ | frontend build ✅ | E2E 36/36 (production HTTPS) ✅

## Session 65 — Code Review: Full App Deep-Dive Fixes (2026-07-09)

- **Fix: WebP MIME magic-byte signature (Critical)** — Removed broken hardcoded file-size bytes from `MIME_SIGNATURES`. Added special-case detection in `detectMimeFromMagicBytes()` that checks RIFF header (bytes 0-3) + WEBP chunk (bytes 8-11), skipping the variable file-size field. Prevents silent bypass of MIME integrity checks for WebP uploads.
- **Fix: `CreateTicketDto` optional fields (Critical)** — Added `@IsOptional()` to `subCategoryId` and `locationId` to match the nullable Prisma schema. The service layer already handled optional connects correctly; DTO validation now allows omitting these fields.
- **Fix: `frontend/nginx.conf` SPA cache-control (Important)** — Added separate `/assets/` (immutable 1yr) and `= /index.html` (no-cache) location blocks with cache headers + full security headers, matching main `nginx.conf`. Prevents stale cached assets after deployments.
- **Refactor: `AuditLogRepository`** — Created new repository following the established pattern. `AuditService` and `AuditLogsService` now inject `AuditLogRepository` instead of `PrismaService` directly. Registered in `RepositoriesModule`; `ServicesModule` and `AuditLogsModule` import explicitly per convention.
- **Security: Swagger gated behind dev mode** — OpenAPI docs at `/docs` only mounted when `NODE_ENV !== 'production'`, preventing API schema exposure in production.
- **Security: ticket creation rate-limit** — `POST /api/tickets` now throttled at 5 req/min per user via `@Throttle` decorator, preventing spam ticket creation.
- **Verification**: backend lint 0 errors ✅ | backend 757/757 tests ✅ | frontend lint 0 errors ✅ | frontend build ✅ | E2E 36/36 (production HTTPS) ✅

## Session 64 — TypeScript Code Review: Nullable Types, ESLint, Ref Patterns, Filter Sync, N+1 Query (2026-07-08)

### Round 1 — Types, ESLint, Axios, Ref Patterns

- **Fix: nullable field types** — Changed all API-returned nullable fields from optional (`?:`) to required-but-nullable (`: type | null`) in `types/index.ts` (`avatarUrl`, `subCategoryId`, `locationId`, `assignedToId`, `slaDueAt`, `slaStatus`, `resolvedAt`, `closedAt`, `commentId`, `visibility`, `description`, `oldValue`, `newValue`). Matches actual API contract where nullable fields are always present with `null` value.
- **Fix: `AuthResponse`/`RefreshResponse` types** — `firstName`/`lastName` changed from optional to required (backend always sends them via `generateTokens()`).
- **Feat: `eslint-plugin-react-hooks` installed** (frontend) — enabled `react-hooks/recommended` rules. Configures `set-state-in-effect: warn` (form init patterns) and `preserve-manual-memoization: off` (experimental).
- **Fix: axios FormData upload retry** — Refresh+retry now skips `multipart/form-data` requests since FormData streams cannot be re-consumed.
- **Refactor: deduplicated `refreshAccessToken()`** — Extracted shared function, removed duplicate inline refresh logic from axios interceptor.
- **Fix: `ProtectedRoute` stale closure** — Used `useAuthStore.getState().login()` in `.then()` callback to avoid closure over changing `login` reference. Removed `login` from effect deps.
- **Fix: `ProtectedRoute` navigateState pattern** — Changed from `useRef({ from: location }).current` to `useMemo(() => ({ from: location }), [])` to satisfy `react-hooks/refs` rule.
- **Fix: ref access during render** — Moved `onCloseRef.current`, `onPageChangeRef.current`, and `entriesRef.current` assignments from render body to `useEffect` (×3 files: `Modal.tsx`, `TicketList.tsx`, `use-file-upload.ts`).
- **Fix: `NotificationPreferencesSection`/`TelegramConfigSection` ref patterns** — Replaced `useRef` for initial config with `useState` to eliminate ref access during render.
- **Fix: updated test mocks** — Added `avatarUrl: null` to all mock `User` objects across 9 test files.

### Round 2 — Filter Sync, N+1 Query, Type Safety, Sort Constant

- **Fix: `TicketFilters` useEffect sync overwrite** — Added `justAppliedRef` flag so the Apply→parent→prop→local sync loop doesn't clobber user edits immediately after clicking Apply.
- **Fix: `UsersService` falsy guard** — Changed `role: value || 'EndUser'` to `role: value ?? 'EndUser'` (nullish coalescing prevents silent substitution of valid falsy values).
- **Perf: `SLAService.findAll()` N+1 query** — Replaced per-config `COUNT(*)` loop with single batch `countTicketsByCategoryPriorityPairs()` query using `(categoryId, priority) IN (...)` — reduces RTT from N to 1.
- **Fix: `AppThrottlerGuard` `any` cast** — Replaced `(req as any).user` with typed `Request & { user?: { id: string } }` intersection.
- **Refactor: shared sort-field constant** — Extracted `TICKET_SORT_FIELDS` into `QueryTicketDto`, imported by `TicketsService` to prevent DTO ↔ service sort allowlist drift.
- **Fix: `NotificationsGateway` stale timer guard** — Added `expiryTimers.has()` check in setTimeout callback to prevent a stale timer from disconnecting a new socket.
- **Fix: `AGENTS.md` bullet formatting** — Normalised `|- ` to `- ` on Common Pitfalls section.
- **Verification**: backend lint 0 errors ✅ | backend 757/757 tests ✅ | frontend tsc 0 errors ✅ | frontend lint 0 errors ✅ | frontend 213/213 tests ✅ | frontend build ✅ | E2E 36/36 (production HTTPS) ✅

### Round 3 — Structured Logging, E2E Expansion, Pre-Commit Hooks, Pool Tuning

- **Feat: request correlation ID middleware** — `RequestIdMiddleware` injects UUID per request, reads/propagates `X-Request-ID` header, logs `METHOD /path — correlationId=...` for structured tracing.
- **Feat: E2E test expansion 15→36** — Added role isolation (EndUser 403, ITSupport 200), assignment flow, invalid transition conflict, SLA config listing, notification CRUD, CSV export, user CRUD, FAQ, health correlation-ID header verification.
- **Feat: pre-commit hooks** — husky + lint-staged: staged `backend/**/*.ts` runs `eslint --fix` + `tsc --noEmit`; staged `frontend/**/*.{ts,tsx}` does the same.
- **Perf: Prisma pool timeout** — Added `pool_timeout` to DATABASE_URL params alongside existing `connection_limit` for explicit connection pooling control.
- **Verification**: backend lint 0 errors ✅ | backend 757/757 tests ✅ | frontend tsc 0 errors ✅ | frontend lint 0 errors ✅ | frontend 213/213 tests ✅ | frontend build ✅ | E2E 36/36 (production HTTPS) ✅

### Round 4 — JSON Logging, A11y Tests, Observability Docs

- **Feat: structured JSON logging** — `JsonLogger` extends NestJS `ConsoleLogger`, outputs every log line as JSON with `timestamp`, `level`, `correlationId`, `context`, `message`, and optional `stack`. `AsyncLocalStorage` propagates correlation ID through entire request lifecycle.
- **Feat: automated accessibility tests** — 7 `jest-axe` tests covering LoginPage, TicketsPage, Pagination, LoadingSpinner, EmptyState, ErrorMessage, ConfirmDialog.
- **Fix: EmptyState heading accessibility** — Changed `<h3>` to `<h2>` to satisfy heading-order rule (page-level `h1` from parent, then `h2` for section title).
- **Docs: ARCHITECTURE.md §8 Observability** — New section documenting JSON logger, correlation ID propagation, and environment-aware log levels.
- **Verification**: backend lint 0 errors ✅ | backend 757/757 tests ✅ | frontend tsc 0 errors ✅ | frontend lint 0 errors ✅ | frontend 220/220 tests (incl. 7 a11y) ✅ | frontend build ✅ | E2E 36/36 (production HTTPS) ✅

### Round 5 — Final Polish

- **Fix: SLA time zero-guard** — `splitMinutesForInput(0)` now returns `{ 0, 'minutes' }` instead of incorrectly matching `0 % 60 === 0` and returning "days".
- **Fix: health controller semantics** — Changed `message || null` to `message ?? null` for nullish coalescing precision.
- **Fix: CI pipeline + critical startup bug** — Added `prisma migrate deploy` step, `.nvmrc` files (Node 20 pinning), switched `setup-node` to `node-version-file`. Fixed `NestFactory` import typo in `main.ts` (`@nestjs/common` → `@nestjs/core` — backend crash on startup bug introduced in R4).
- **Verification**: backend 757/757 ✅ | frontend 220/220 ✅ | E2E 36/36 ✅

## Session 63 — Code Review: Lock Error Handling, Missing onError, Duplicate Filter, E2E Stability (2026-07-08)

- **Fix: SLA cron lock release error handling** — `checkSLA()` finally block `.catch(() => {})` prevents unhandled error on Redis failure (matching `recalculateOpenTicketsForConfig` pattern).
- **Fix: Maintenance restore lock release error handling** — `restoreBackup()` success path `releaseLock()` now `.catch(() => {})` to prevent unhandled rejection.
- **Fix: missing frontend mutation onError** — `useUploadAttachment()` now shows toast on failure (only mutation hook missing error feedback).
- **Refactor: extract duplicate filter logic** — `buildTicketQueryInput()` shared helper eliminates 80 lines of duplicated WHERE/sort building between `findAll()` and `exportCsvToResponse()`.
- **Fix: nginx default_server access_log blocked by read_only** — `/var/log/nginx` added to nginx container tmpfs so access log can be written with `read_only: true`.
- **Fix: E2E nginx rate limit 503** — Maintenance mode tests now include 200ms delay before first PATCH to account for nginx 10r/s api_limit zone.
- **Fix: HSTS missing on static file locations (Critical)** — nginx `add_header` in location blocks overrides server-level HSTS. Moved HSTS into all 6 location blocks (`/`, `/index.html`, `/assets/`, `/api/`, `/api/maintenance/`, `/socket.io/`). Disabled NestJS helmet HSTS to prevent double headers on API paths.
- **Verification**: backend 757/757 ✅ | frontend 213/213 ✅ | E2E 15/15 (production HTTPS) ✅ | HSTS verified on all paths ✅

## Session 62 — Master Data UI Upgrade, Delete Guards, SLA Fixes (2026-07-08)

- **Perf: blink fix** — TicketsPage imported eagerly (no React.lazy) + placeholderData removes loading spinner flash on first navigation.
- **Feat: full column sort** — 11 columns sortable on Tickets table; CSV export respects sort.
- **Feat: multi-select checkbox filters** — Status/Priority/SLA Status/Category via MultiSelect component; comma-separated API.
- **Feat: Location & Created By filters** — `locationId`/`requesterId` arrays in DTO; `GET /api/users/active` endpoint; auto-sync with Master Data mutations.
- **Feat: search expanded** — Added `itemCode`, `location.name`, `requester.name` to ticket search (6 fields total).
- **Feat: Master Data Switch toggle** — Categories, SubCategories, Locations, SLA Configs: Status Badge replaced with inline Switch. Toggle updates `isActive` directly.
- **Feat: delete guards with blocked popup** — Categories, Locations, SubCategories, Users, SLA Configs check `_count` before ConfirmDialog; blocked popup shown if related records exist.
- **Style: unified action buttons** — All tables (Users, Categories, SubCategories, Locations, SLA Configs, Backups) now use `btn-secondary btn-sm`/`btn-danger btn-sm` with `gap-2` flex wrapper (FAQ pattern).
- **Fix: filter inactive subcategories & locations** — CreateTicketForm now filters `isActive` on subcategories and locations (was only filtering categories).
- **Fix: sub-category delete** — Backend throws `ConflictException` instead of silent soft-delete. `_count.tickets` added to subcategories in categories API.
- **Fix: user delete guard** — `USER_SAFE_SELECT` now includes `_count` (createdTickets, assignedTickets, comments, attachments). Frontend shows blocked popup if counts > 0.
- **Fix: correct _count relation names** — `tickets` → `createdTickets`/`assignedTickets` in `USER_SAFE_SELECT` (wrong relation name broke login).
- **Feat: lock assignment on inactive user** — When assigned user is deactivated, assign dropdown is disabled with tooltip. `useUpdateUser` invalidates `['tickets']` + `['users', 'assignable']`.
- **Feat: SLA Config Delete** — `DELETE /api/sla-configs/:id` endpoint + frontend Delete button + ConfirmDialog. Checks ALL tickets before allowing delete.
- **Fix: SLA clear on deactivate** — `isActive: false` now clears `slaDueAt`/`slaStatus` for non-terminal tickets via `clearSlaForConfig()`.
- **Fix: stale SLA values** — `TicketsService.stripStaleSlaValues()` nuls out SLA fields when the matching SLA config is inactive (runs on every ticket list/detail fetch).
- **Fix: auto-refetch on nav** — Global `refetchOnMount: 'always'` added to `createAppQueryClient()` so page navigation always fetches fresh data.
- **Fix: E2E health test** — Fixed envelope nesting (`res.data.data` instead of `res.data`).

- **SLA Config Manager** — Unified with Switch toggle, Delete button, delete guard, blocked popup. `findAll()` now includes `_count.tickets` (non-terminal count per category+priority). `findAllActive()` exposed as public method.
- **Feat: weekly trend chart** — `getDailyTrends()` supports `'day'|'week'` grouping. 90d+ ranges auto-group into weekly bars (~14 instead of 90). `fillTrendGaps()` aligns cursor to Monday when step >= 7.
- **Fix: trend chart rendering** — Bar layout rewritten (flex-1 spacer + h-full columns) for reliable percentage height. Min bar height 4%. Removed overflow-hidden.
- **Fix: SQL date_trunc literal** — Split `getDailyTrends` into day/week branches (PostgreSQL requires literal 'day'/'week', not parameterized).
- **Feat: dynamic CSV filename** — `tickets-export.csv` → `tickets-YYYY-MM-DD.csv`.

## Session 61 — Master Data UI: Switch Toggle + Delete Guard (2026-07-08)

- **Status → Switch toggle**: Category, SubCategory, Location tables now use `<Switch>` instead of `<Badge>`. Click toggles `isActive` inline.
- **Delete guard**: Before delete, checks `_count.tickets` (and `_count.subCategories`, `_count.slaConfigs` for categories). If > 0, shows info modal with breakdown of what's blocking deletion — user can deactivate instead.
- **`Category._count` type** extended with `subCategories` + `slaConfigs`
- Verification: frontend tsc ✅, 213/213 ✅, build ✅

## Session 60 — Location & Created By Filters, Search Expanded, Master Data Sync (2026-07-08)

- **Location filter** added: multi-select dropdown using `useLocations()` hook
- **Created By (Requester) filter** added: multi-select dropdown using new `GET /api/users/active` endpoint (returns all active users for Admin/ITSupport)
- **Search expanded**: now searches `itemCode`, `location.name`, and `requester.name` in addition to `subject`, `description`, `ticketNumber`
- **Backend**: `locationId` + `requesterId` as multi-value arrays in DTO, service, and raw SQL. Raw SQL updated with `t.` alias and conditional LEFT JOINs for relation-field search
- **New endpoint**: `GET /api/users/active` — returns all active users as flat list (Admin/ITSupport)
- **Master Data sync**: ticketing filters auto-refresh because mutations in MasterDataManagement already invalidate `['categories']`, `['locations']`, and `['users']` query keys — no additional work needed
- **Blink fix**: TicketsPage imported eagerly (no `React.lazy`), `useTickets` uses `placeholderData` with empty fallback — eliminates double-spinner flash on first navigation
- Verification: backend 757/757 ✅, frontend 213/213 ✅, lint 0 errors ✅, build ✅

## Session 59 — Multi-Select Checkbox Filters on Tickets Page (2026-07-08)

- **Filter UI change**: Status, Priority, SLA Status, Category now use multi-select dropdowns with checkboxes (replaces single-select `<select>`). Date filter unchanged.
- **Backend `QueryTicketDto`**: `status`, `priority`, `slaStatus`, `categoryId` → arrays. `@Transform(splitComma)` splits comma-separated query params; service uses Prisma `{ in: [...] }` filter
- **Raw SQL update**: `findManySortedBySlaStatus` uses `= ANY(ARRAY[...])` for multi-value filters
- **`MultiSelect` component** (new): reusable dropdown with checkboxes, "Select All", click-outside-close, badge counter
- **CSV export**: arrays joined with comma before sending to API
- **Verify**: endpoint test — `?status=Resolved,Closed` ✅, `?priority=Low,Medium,High` ✅, `?slaStatus=OnTrack,AtRisk,Breached` ✅, invalid value 400 ✅; backend 757/757 ✅; frontend 213/213 ✅; lint 0 errors ✅

## Session 58 — Full Column Sort on Tickets Table (2026-07-08)

- **All columns sortable**: Category, Location, Item Code, Assigned To, Created By now click-to-sort via `<SortHeader>`
- **Backend `buildOrderBy()`**: maps relation fields (category, location, assignedTo, requester) to Prisma nested `{ relation: { name: dir } }` syntax; direct fields (itemCode, etc.) stay as shorthand
- **CSV export respects sort**: `sortBy` & `sortOrder` now sent as query params to export endpoint — exported CSV matches current list view sort
- Validation `@IsIn` list updated with 5 new sortBy values
- Verification: backend tsc ✅, lint 0 errors, 757/757 ✅; frontend build ✅, lint 0 errors; endpoint test 7/7 ✅

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
