# IT Support Ticketing

## Purpose
- Compact project memory for agents; read before starting work.
- If this file conflicts with current code, trust the code and mention/update this file when relevant.
- Read `CHANGELOG.md` for regression context and historical changes (performance, bug fixes, security sessions 2–4); do not duplicate that history here.

## Stack Snapshot
- Backend: NestJS 11, Prisma 5, PostgreSQL 16, Redis 7, Socket.IO notifications.
- Frontend: React 18, Vite 8, TanStack Query 5, Zustand, Tailwind.
- API success: `{ data, meta? }` (enforced globally via `TransformInterceptor`); paginated `meta` is `{ page, limit, total, totalPages }` (always includes `totalPages`).
- API error: `{ error: { code, message } }` via `HttpExceptionFilter` (stable codes: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `UNPROCESSABLE_ENTITY`, `TOO_MANY_REQUESTS`, `MAINTENANCE`, `INTERNAL_ERROR`).

## Work Style
- Stay inside the user's scope; if a path/page/endpoint is named, start there.
- Frontend bug: page -> related hook/component -> API/backend only if evidence points there.
- API bug: controller -> service -> repository.
- Backend change: keep service -> repository flow; new services inject repositories, not `PrismaService`.
- Preserve user changes; never revert/reset/checkout files without explicit request.

## Workflow
- Context: use the Project Structure & API Map below as initial map; look up specific files directly, no recursive scan. Read at most 3–5 files before planning. No edits before context complete.
- Execution: narrowest change within scope; no unrequested features/refactors; prefer reversible actions; no destructive ops without confirmation; one logical change = one commit.
- Reporting: summarize files changed + reasons + verification evidence; flag behavior changes humans must know.

## Non-Negotiable Rules
- Do not persist access tokens in `localStorage`, `sessionStorage`, or other persistent storage.
- Do not add hardcoded fallbacks for `JWT_SECRET`, `DATABASE_URL`, or `REDIS_URL`.
- Do not expose EndUser to Dashboard, `/admin`, other users' tickets, or internal comments/attachments.
- Do not send Telegram bot token/group chat secrets to frontend; return flags such as `hasBotToken`/`hasGroupChatId`.
- Do not run `docker compose down -v` or destructive Git commands unless explicitly requested.
- Do not change Docker/HTTP/HTTPS flow unless requested; check Docker & HTTP notes first.
- Maintenance and backup/restore operations remain Admin-only.
- The `backend/docker-entrypoint.sh` uses `#!/bin/bash` (not `#!/bin/sh`) because it requires `set -o pipefail`. The Docker image must include `bash` (it does — `node:20-bookworm-slim` includes it).
- `MaintenanceService.restoreDatabase()` uses `execFileAsync('bash', ['-c', ...])` (not `'sh'`) because the gzip→awk→psql pipeline uses `set -o pipefail`. The same bash requirement applies — never use `'sh'` for shell commands that rely on `pipefail`.
- CI/CD pipeline lives in `.github/workflows/ci.yml` — runs backend + frontend lint, test, build on push/PR to `main`.

## Verification Commands
| Area | Workdir | Command |
|------|---------|---------|
| Backend unit tests | `backend` | `npm test` |
| Backend lint | `backend` | `npm run lint` |
| Backend E2E tests | `backend` | `E2E_HOST=helpdesk.rsmch.internal E2E_PORT=443 E2E_PROTOCOL=https npm run test:e2e` |
| Backend build | `backend` | `npm run build` |
| Frontend build | `frontend` | `npm run build` |
| Frontend lint | `frontend` | `npm run lint` |
| Frontend tests | `frontend` | `vitest` |
| Full compose rebuild | repo root | `docker compose up --build` |
| Start existing compose | repo root | `docker compose up -d` |
| Build API image | repo root | `docker compose build api` |
| Build frontend image | repo root | `docker compose build frontend` |
| Operational backup | repo root | `./scripts/backup.sh` |
| Logs | repo root | `docker compose logs -f SERVICE` where `SERVICE` is `api`, `frontend`, or `nginx` |

## Project Structure
```
backend/src/{auth,tickets,comments,attachments,categories,sub-categories,dashboard,users,sla,notifications,telegram,maintenance,health,faqs}
backend/src/dashboard/dto/query-dashboard-stats.dto.ts
backend/src/common/repositories/{user,ticket,comment,attachment,category,sub-category,sla-config,notification,telegram-config}.repository.ts
backend/src/common/policies/attachment-visibility.policy.ts
backend/src/common/utils/{upload,mime-validation,time,concurrency,env-validation,notification-preference,transform,pagination}.util.ts
backend/src/common/config/app.config.ts
frontend/src/{auth,layout,pages,components/admin,components/ui,components/tickets,components/dashboard,components/account,hooks,stores,types,lib}
frontend/src/hooks/use-file-upload.ts
frontend/src/components/admin/BackupManager.tsx
frontend/.eslintignore
postgres/postgresql.conf
```

## File Placement & Conventions
- Backend module files live in `backend/src/{module}/` with `module.ts`, `controller.ts`, `service.ts`, and `dto/`.
- Backend repositories live in `backend/src/common/repositories/`.
- Backend policies live in `backend/src/common/policies/` (e.g., `AttachmentVisibilityPolicy`).
- Backend shared utilities live in `backend/src/common/utils/` (e.g., `upload.util.ts`, `mime-validation.util.ts`, `time.util.ts`, `concurrency.util.ts`).
- Frontend pages: `frontend/src/pages/`.
- Frontend components: `frontend/src/components/{domain}/`.
- Frontend hooks: `frontend/src/hooks/` for TanStack Query hooks.
- Frontend stores: `frontend/src/stores/` for Zustand.
- Frontend `types/` and `lib/` hold shared types, axios client, and utilities (including `sla-time.ts` for SLA duration conversion, `thumbnail-cache.ts` for shared image thumbnail URL management).
- Use `kebab-case` files, `PascalCase` components/classes, and `camelCase` variables/functions.
- Frontend uses functional components, named exports, Tailwind utilities, and `@/` alias.
- Frontend visual system uses the Blue Operations palette from `tailwind.config.js`: `primary` (royal blue), `navy` (brand/dark surfaces), and `surface` (blue-tinted backgrounds). Prefer these tokens over slate classes.
- Shared frontend component utilities in `frontend/src/index.css` include `.card`, `.card-header`, and `.card-body`; keep `.card-body` because dashboard and ticket detail cards depend on it for spacing.
- Use `frontend/src/components/ui/BrandMark.tsx` for the polished `SH` mark instead of duplicating logo markup.
- Do not add CSS modules or styled-components.
- Backend imports are relative within modules.
- DTO validation uses `class-validator` with `whitelist` and `forbidNonWhitelisted`.
- Backend ESLint config file is `eslint.config.mjs` (ES module `.mjs` extension to avoid Node.js module-type warning; if you create a new ESLint config or migrate existing, use `.mjs` or add `"type": "module"`).
- Throw `BadRequestException`/`NotFoundException` on backend; use `toast.error()` on frontend.

## State Management
- TanStack Query owns server state: tickets, users, categories, sla-configs, notifications, dashboard stats, notification preferences.
- StaleTime tiers: reference data 5–30 min (`STALE_TIME_*` in `lib/constants.ts`), operational data 10–30s. Global query defaults are `staleTime: 0` and `refetchOnWindowFocus: true` (operational data stays fresh); reference hooks opt into longer caches via explicit `staleTime`. Hooks without explicit staleTime inherit the global 0 (refetch on mount/focus).
- Zustand persisted state: theme only. Startup applies the persisted theme via `applyInitialTheme()` in `lib/app-initializers.ts` before React renders, reading the `pref`/`mode` shape (not the legacy `isDark` key).
- Zustand non-persisted state: auth user/accessToken and notification count.
- React state owns form and component-local UI state.
- Dashboard page owns range state (`DashboardStatsQuery`) and passes it down; `useDashboardStats(query)` serializes the query into a stable string key via `serializeQuery()` to prevent infinite refetch loops from object reference changes. Query client is constructed via `createAppQueryClient()` in `lib/app-initializers.ts`. All ticket and SLA config mutations invalidate `['dashboard', 'stats']` (the actual dashboard query key), not the prefix `['dashboard']`.

## Auth & Security
- **CSRF protection**: `CsrfGuard` is registered as the first global `APP_GUARD` in `app.module.ts` (before `MaintenanceGuard`). It requires `X-Requested-With: XMLHttpRequest` header on all state-changing requests (POST, PATCH, PUT, DELETE). Safe methods (GET, HEAD, OPTIONS) and exempt paths (`/auth/login`, `/auth/refresh`, `/auth/logout`, `/health`) bypass the check. This is the "custom header" pattern — browsers enforce same-origin policy on custom headers, so a cross-origin attacker cannot set `X-Requested-With` via HTML forms or auto-submitting mechanisms.
- Access token is memory-only in Zustand auth state.
- Access token has `tokenType: 'access'` claim; refresh token has `tokenType: 'refresh'`.
- JWT signing/verification pinned to `HS256` algorithm in all verification paths — `JwtModule`, `JwtStrategy`, `AuthService.refresh()`, `AuthService.revokeRefreshToken()`, `NotificationsGateway.handleConnection()`, and `MaintenanceGuard` — to prevent algorithm-downgrade attacks.
- Refresh token is an httpOnly cookie with path `/api/auth`; revoke via Redis key `refresh:{sub}:{jti}`. Refresh token rotation uses atomic Lua GETDEL to prevent replay.
- Refresh tokens are bound to **device fingerprint** (SHA-256 hash of User-Agent + client IP, stored alongside the token in Redis). On refresh, if the fingerprint doesn't match, the token is immediately revoked and a new one is issued only on re-login. Legacy tokens without a fingerprint are accepted for backward compatibility.
- Refresh TTL via `JWT_REFRESH_TOKEN_EXPIRY` env; cookie maxAge follows env.
- Logout is cookie-based (no access token required); always clears refresh cookie and revokes Redis key.
- `JwtAuthGuard` is a global guard (fail-closed); use `@Public()` to exempt public endpoints (health, auth login/refresh/logout, `maintenance/mode` GET). Do NOT add redundant `@UseGuards(JwtAuthGuard)` on individual controllers — it creates a second guard instance that double-verifies every JWT. `JwtAuthGuard` is already registered as `APP_GUARD` in `app.module.ts`. When using `@Roles()` for role checks, also add `@UseGuards(RolesGuard)` — `RolesGuard` is NOT a global guard.
- `RolesGuard` uses the shared `ROLES_KEY` constant exported from `roles.decorator.ts` (not a string literal) so a typo cannot silently disable role checks. `RolesGuard` is NOT a global guard — it must be applied per-endpoint via `@UseGuards(RolesGuard)` alongside the `@Roles()` decorator.
- Cookie `secure` defaults to `x-forwarded-proto` check; override with `COOKIE_SECURE=true/false` env.
- `JWT_SECRET`, `DATABASE_URL`, and `REDIS_URL` are required at startup; production requires min 32-char `JWT_SECRET` and `REDIS_PASSWORD`.
- `JwtStrategy.validate()` wraps the repository lookup in `try/catch`; repository failures (e.g., during DB outage/restore) become `UnauthorizedException` (401), not 500.
- Account locks after 10 failed logins (Redis tracking, 15-min window). Lockout counter uses atomic Lua INCR+EXPIRE to prevent permanent lock on partial Redis failure.
- `CORS_ORIGIN` is comma-separated (parsed via `getCorsOrigins()` from `env-validation.util.ts`). Production rejects non-`https://` origins. Defaults to `https://helpdesk.rsmch.internal`; Docker local is HTTP-only, so set env explicitly when using an HTTP origin.
- Non-HTTP exceptions must not leak internal messages to clients.
- Password hash cost is bcrypt 12; seed uses `upsert` on restart.
- `POST /api/auth/change-password` is restricted to ITSupport & Admin via `RolesGuard`; EndUser cannot change own password (must request Admin/ITSupport). Frontend hides the Change Password section in My Account for EndUser.
- `POST /api/auth/refresh` is rate-limited to 5 requests per 60 seconds (matching login). Both `login` and `refresh` endpoints share the same throttle configuration to prevent brute-force of refresh tokens.
- `UsersService.update()` and `UsersService.delete()` use `await eventEmitter.emitAsync(...)` for `user.password_changed`, `user.deactivated`, and `user.deleted` so refresh-token revocation (handled in `AuthService` `@OnEvent` listeners) completes before the service call resolves. In `delete()`, the conflict catch wraps only `transactionDelete()`; revocation `emitAsync` is wrapped in try/catch — failures are logged but do NOT propagate as 500, preventing retry-inconsistency when the DB deletion already succeeded.
- WebSocket clients disconnect when user is inactive (`isActive=false`).
- WebSocket sessions are bounded to access-token expiry: `NotificationsGateway` reads `payload.exp` and schedules a `setTimeout` disconnect at expiry; already-expired tokens disconnect immediately. Timers are cleared on disconnect/deactivation.
- WebSocket `reconnect_attempt` handler (`useSocket`) reads the latest access token from Zustand store via `useAuthStore.getState().accessToken` and updates `socket.auth` so reconnection attempts use a fresh token. On token expiry, the socket does NOT disconnect (unlike previous behavior) — it lets the `reconnect_attempt` handler refresh auth and the useEffect cleanup + re-creation provides a secondary recovery path when the store's `accessToken` changes.
- Upload filenames are generated server-side (`uuid + original extension`); MIME validation via `assertMimeTypeIntegrity()` uses magic-byte detection before the extension is preserved. `originalName` stored in DB for display only.
- Telegram config API response strips `groupChatId`; only `hasBotToken`/`hasGroupChatId` flags returned to frontend.

## Roles & Access
| Role | Dashboard | New Ticket | My Account | Users | Master Data | Maintenance |
|------|-----------|------------|------------|-------|-------------|-------------|
| EndUser | No | Yes | Yes | No | No | No |
| ITSupport | Yes | Yes | Yes | No | No | No |
| Admin | Yes | Yes | Yes | Yes | Yes | Yes |

### Category Field-Set by Role

`GET /api/categories` returns different field sets by role (intentional, per CHANGELOG P1-06):
- **Admin**: full data including `_count` and `slaConfigs` (used by Master Data management page).
- **ITSupport & EndUser**: minimal field set (id, name, description, active sub-categories) — used by ticket create form and filters. ITSupport does not have a Master Data UI, so full shape is not needed.

## Ticket Rules
- Ticket status enum values (PascalCase, no spaces): `Open`, `InProgress`, `OnHold`, `Resolved`, `Closed`.
- Ticket priority enum values (PascalCase): `Low`, `Medium`, `High`, `Critical`.
- EndUser can create own tickets, view only own tickets, and close own `Resolved -> Closed` tickets.
- EndUser cannot comment, upload, or list attachments for tickets owned by another user.
- Internal comments and internal attachments are never returned/displayed to EndUser.
- Attachment visibility is centralized via `AttachmentVisibilityPolicy` in `backend/src/common/policies/`.
- EndUser sees only PUBLIC direct attachments and attachments from PUBLIC comments.
- ITSupport/Admin can access dashboard and operational ticket workflows.
- `updateStatus()` is atomic: conditional `updateMany({ where: { id, status: oldStatus } })` → 409 Conflict on race.
- `delete()` preserves audit trail: The deletion emits `ticket.deleted` via `EventEmitter2` and the server logs capture the event. Related records (comments, attachments, ticket_history) are cascade-deleted via FK `ON DELETE CASCADE`. The caller must supply `userId` (`deletedBy`). The forensic trace is preserved in the event emitter payload and server logs.
- Notification preferences: users can disable in-app notifications per event type. The toggle set is role-scoped (`notification-preference.util.ts`). `null`/absent prefs = all on. Filter applied at creation in `NotificationsService` handlers — unread-count, list queries, and WebSocket gateway stay untouched.
- Ticket mutation events: `ticket.created`, `ticket.status.updated`, `ticket.assigned`, `ticket.priority.updated`, `ticket.deleted` are emitted via `EventEmitter2`. `DashboardService` listens to all five and invalidates its Redis cache (`dashboard:stats:v2:*` via `deleteByPattern`) so stats stay fresh without waiting for the 30s TTL.

## Maintenance Mode
- Flags live in Redis: `maintenance:enabled`, `maintenance:message`; Redis is not restored from backups.
- `MaintenanceGuard` is a global guard in `app.module.ts` and runs before `ThrottlerGuard`.
- `MaintenanceGuard` uses a 2-second in-memory cache + Redis `mget` to reduce round-trips. Allowed paths (`/health`, `/maintenance/*`, `/auth/*`) are checked BEFORE Redis; if Redis is unreachable, guard defaults to allow (fail-open).
- `MaintenanceGuard` injects `Reflector` to read `IS_PUBLIC_KEY` so invalid/expired tokens on public non-allowlisted routes return 503 instead of bypassing maintenance.
- Always allowed during maintenance: `/api/health`, `/api/maintenance/*`, `/api/auth/*`.
- When maintenance is enabled, `MaintenanceGuard` verifies the JWT from `Authorization` header: Admin → allow through; non-admin → `503 { error: { code: 'MAINTENANCE', message } }`; expired/invalid token on a **protected** route → allow (let `JwtAuthGuard` handle 401 → frontend refresh); expired/invalid token on a **public non-allowlisted** route → 503 (public routes skip `JwtAuthGuard`, so they cannot "fall through" to a 401); no token → 503. The guard uses `Reflector` + `IS_PUBLIC_KEY` to distinguish public from protected routes.
- `restoreBackup()` enables maintenance, drains for 5 seconds before `DROP SCHEMA`, then disables it after restore only if restore succeeded. On success, release `maintenance:restore:lock` before disabling maintenance; otherwise `setMaintenanceMode(false)` rejects with `Cannot disable maintenance during active restore`. On failure, logs the original error via `Logger` and keeps maintenance enabled with the pre-restore backup ID in the error message.
- Restore DB import handles schema-only dumps that omit extensions: it rewrites `CREATE SCHEMA public;` to idempotent schema creation and injects `CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;` before trigram indexes (`gin_trgm_ops`) are created.
- `restoreUploads()` creates its tempDir **inside** `uploadDir` (same Docker volume) to avoid `EXDEV` cross-device rename errors; the tempDir basename is excluded from the upload dir clear step.
- Frontend `MaintenanceBanner` polls `/api/maintenance/mode` dynamically: fast-poll (every 15s) when maintenance is enabled, stops polling when disabled. Re-enabled by refetch on window focus or 503 axios interceptor. Admin sees a small non-blocking banner; non-admin sees a full-screen overlay that blocks interaction.
- Frontend axios 503 handler redirects only Admin to `/admin/maintenance`; non-admin requests are rejected without redirect (no redirect loop).
- Admin must enable maintenance mode before backup/restore from UI.
- `GET /api/health` is public and includes `maintenance: { enabled, message }`.

## Telegram
- Backend module `telegram/` handles polling bot, config CRUD, linking, checks, test notifications, and event-driven sends.
- Config is stored in `TelegramConfig`: `botToken`, `enabledEvents`, templates, `enableGroupChat`, `groupChatId`, `notifyIndividualsWhenGroupChat`.
- Bot token fallback order: DB config -> `.env TELEGRAM_BOT_TOKEN`.
- Bot polling uses `TelegramService.pollLoop()` with non-blocking `setTimeout`, 30s long-poll timeout, and 30s idle delay.
- Event listener sends `ticket.created`, `ticket.assigned`, and `ticket.status.updated` notifications.
- If group chat is enabled, messages go to group first; individual linked-user sends happen only when `notifyIndividualsWhenGroupChat=true`.
- Frontend Telegram section in My Account is Admin-only.
- Frontend receives secret presence flags only, such as `hasBotToken` and `hasGroupChatId`.
- Template variables: `{ticketNumber}`, `{subject}`, `{priority}`, `{createdBy}`, `{oldStatus}`, `{newStatus}`, `{assignedBy}`, `{url}`.

## Docker & HTTP Notes
- Docker local is HTTP only; nginx listens on port 80 for development. Production HTTPS uses the `docker-compose.prod.yml` override (`nginx/nginx.ssl.conf` on port 443 + TLS) — no manual edits to `nginx.conf` or `docker-compose.yml` needed. `nginx.ssl.conf` includes TLS hardening: `ssl_ciphers HIGH:!aNULL:!MD5`, `ssl_prefer_server_ciphers`, `ssl_session_cache`, `ssl_session_tickets off`, HSTS header, separate WebSocket rate limit zone (`ws_limit` 5r/s), and tightened CSP (no `ws: wss:` on static assets).
- `backend/.env.compose.example` ships with local HTTP defaults (`NODE_ENV=development`, `COOKIE_SECURE=false`) matching the bundled HTTP-only nginx. Production behind an HTTPS reverse proxy requires `NODE_ENV=production`, `COOKIE_SECURE=true`, and HTTPS `CORS_ORIGIN` — documented in the example file header.
- Domain: `helpdesk.rsmch.internal` via AdGuard Home DNS rewrite.
- Cert files under `nginx/certs/` are gitignored; consumed by `docker-compose.prod.yml` for mkcert TLS.
- Production mkcert TLS: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d`. Full step-by-step production setup (env config, TLS options, build/start, verify) is in `README.md` §Production Deployment.
- **Lockfile compatibility**: after running `npm install` or `npm update` locally, regenerate lockfiles with the Docker node version to prevent `npm ci` failures: `docker run --rm -v "$(pwd)/frontend":/app -w /app node:20-alpine npm install --package-lock-only` and `docker run --rm -v "$(pwd)/backend":/app -w /app node:20-bookworm-slim npm install --package-lock-only`.
- `frontend` service builds `frontend/Dockerfile` target `builder`, copies `/app/dist` to `frontend_dist`, then stays running.
- `nginx` serves static files from `frontend_dist:/usr/share/nginx/html` and proxies API traffic.
- `nginx` also proxies `/socket.io/` with WebSocket upgrade headers for realtime notifications.
- `api` binds port `3000` to `127.0.0.1` for local debug; normal traffic goes through nginx `/api/`.
- `api`, `db`, and `cache` services read from separate env files via `env_file` (least-privilege, SEC-023): `api` → `backend/.env` (full set), `db` → `backend/.env.db` (PostgreSQL only), `cache` → `backend/.env.cache` (Redis only). Templates: `.env.compose.example`, `.env.db.example`, `.env.cache.example`. `POSTGRES_PASSWORD` in `.env.db` and `REDIS_PASSWORD` in `.env.cache` must match the values in `backend/.env`. `cache` requires `REDIS_PASSWORD` and starts Redis with `requirepass` + `maxmemory 400mb` + `maxmemory-policy allkeys-lru`.
- `db` uses a custom `postgres/postgresql.conf` (`listen_addresses='*'`, `shared_buffers=512MB`, `work_mem=16MB`, `effective_cache_size=1536MB`) and `shm_size: 1g` for parallel query performance. `listen_addresses='*'` is required so PostgreSQL binds to the Docker network interface instead of only localhost.
- Backup output lives in `backups/<timestamp>/{db.sql.gz,uploads.tar.gz,manifest.txt}` and `backups/` is gitignored.
- `db.sql.gz` covers public schema tables; Redis is not backed up.
- Backup and restore locks use token-matched TTL renewal: a background heartbeat (`LOCK_RENEW_INTERVAL_MS = 120s` in `MaintenanceService`) extends the TTL while the operation runs, and the manual `scripts/backup.sh` runs its own shell heartbeat. Token comparison on release/renew prevents a second operation from extending a lock it does not own.
- Admin UI `/admin/maintenance` can create/list/download/delete/restore backups with typed confirmation and pre-restore backup.
- `scripts/backup.sh` (manual CLI backup) now also checks Redis `maintenance:restore:lock` and acquires `maintenance:backup:lock` via `SET NX EX 600` before proceeding, preventing races with API-initiated backups/restores. A background heartbeat renews the lock every 120s while the script runs; the trap stops the heartbeat and releases the lock on exit. The tar artifact is chowned to the host UID/GID and `chmod 600` is reapplied.
- API image includes `postgresql-client-16`, `gzip`, `tar`, and `gosu`; entrypoint chowns `/app/uploads` and `/app/backups`, runs migrations with 3-retry loop, runs seed (dev mode or `SEED_ON_START=true`), then runs as `node`.
- Redis has no persistence volume. Refresh tokens and maintenance flags are lost on `cache` container recreate. This is an intentional tradeoff: mass logout on Redis restart is acceptable for this deployment.

## API Map
- Health: `GET /api/health` includes maintenance status.
- Auth: `POST /api/auth/login|refresh|logout|change-password`.
- Tickets: `GET|POST /api/tickets`, `GET|PATCH|DELETE /api/tickets/:id`, `PATCH /api/tickets/:id/status|assign|priority`, `GET /api/tickets/export/csv`.
- Ticket children: `GET|POST /api/tickets/:id/comments|attachments`; EndUser sees only own visible resources.
- Categories: `GET|POST|PATCH|DELETE /api/categories`, `GET /api/categories/:id`, and `/api/categories/:categoryId/sub-categories`.
- Deprecated sub-category shortcuts: `PATCH|DELETE /api/sub-categories/:id`; prefer full category path.
- SLA: `GET|POST|PATCH /api/sla-configs`. Create and timing update auto-recalculate affected non-terminal tickets.
- Dashboard: `GET /api/dashboard/stats` supports range query (`?range=7d|30d|90d|custom&from=YYYY-MM-DD&to=YYYY-MM-DD`); returns `{ current, attention, analytics }`.
  - `current`: `{ activeTickets, open, inProgress, slaRisk, unassigned }` — snapshot counts of active (non-Resolved/Closed) tickets.
  - `attention`: `{ slaRisk[], highPriority[], unassigned[] }` — top 5 tickets per attention category (serialized with ISO date strings).
  - `analytics`: `{ range, trend[], statusCounts, priorityCounts, slaComplianceRate, avgResolutionTimeByCategory[], topCategories[] }` — range-scoped analytics.
- Users: `GET|POST|PATCH|DELETE /api/users`, `GET /api/users/:id`, `GET /api/users/assignable`; `GET ?includeInactive=true` includes inactive users.
- Notifications: `GET|PATCH|DELETE /api/notifications`; supports clear-all, read-all, mark-read, unread-count, and preferences (`GET|PATCH /api/notifications/preferences`) operations.
- Telegram: `GET /api/telegram/status|config`, `POST /api/telegram/link|test-notification|check`, `DELETE /api/telegram/link`, `PUT /api/telegram/config`.
- Maintenance: `/api/maintenance/mode`, `/api/maintenance/backups`, restore, download, and delete endpoints.


## Models
- Models: User, Ticket, Comment, Attachment, Category, SubCategory, SLAConfig, TicketHistory, Notification, TelegramConfig.
- User has `notificationPreferences Json?` (nullable JSONB) — per-event enable/disable map; `null` = all on. Role-scoped toggle set defined in `notification-preference.util.ts`.
- Ticket relates to requester user, assignee user, category, and sub-category.
- Comment relates to ticket and user.
- Attachment relates to ticket, user, optional comment, and has `visibility` (`PUBLIC`/`INTERNAL`).
- `SLAConfig` is unique on `(categoryId, priority)`.
- `TelegramConfig` is singleton enforced by `key` column (`@unique @default("default")`); repository uses `findOrCreate()` on the fixed key.

## Key Model Fields (anti-hallucination)
- `Ticket`: `ticketNumber` (from sequence, not MAX), `status`, `priority`; `visibility` does not exist on the Ticket model — visibility belongs to `Attachment`.
- `Attachment`: `visibility: PUBLIC | INTERNAL`, `originalName` (for display only), filename on disk = uuid + safe extension.
- `Comment`: there is no `isInternal` boolean field — use the `type: CommentType` field (`PUBLIC`|`INTERNAL`). Internal attachment visibility is controlled via `AttachmentVisibilityPolicy`.
- `SLAConfig`: unique constraint on `(categoryId, priority)`. `SLAService.create()` and `SLAService.update()` auto-recalculate affected non-terminal tickets' `slaDueAt` and `slaStatus` after timing changes (`responseTimeMinutes`/`resolutionTimeMinutes`). `isActive`-only updates do NOT trigger recalculation. Recalculation skips `Resolved`/`Closed` tickets.
- `Ticket`: `slaDueAt` (`DateTime?`) and `slaStatus` (`SLAStatus?`) are nullable — when no SLA config matches the ticket's `(categoryId, priority)`, both are `null` instead of a 24h fallback. `SLAService.calculateSlaStatus()` accepts `Date | null` and returns `null` when `slaDueAt` is null. The periodic SLA breach check skips tickets with `slaDueAt IS NULL`.
- `TelegramConfig`: singleton, always accessed via `key = "default"`, use `findOrCreate()` (atomic `upsert`) from the repository — do not call `findFirst()` or `create()` directly.

- `Notification`: clear-all, read-all, mark-read are supported by the API — check the API Map before adding new endpoints.

## Common Pitfalls
- **`CsrfGuard` blocks non-browser clients**: Any programmatic/script caller (curl without `-H 'X-Requested-With: XMLHttpRequest'`, Postman, E2E tests) will get 403 on state-changing requests. Always include the custom header or use the exempt paths for public endpoints.
- Do not inject `PrismaService` directly into new services; always go through the repository in `common/repositories/`.
- `TransformInterceptor` already wraps responses into `{ data, meta? }` globally — do not manually wrap in controllers.
- `AttachmentVisibilityPolicy` is the single source of truth for attachment visibility — do not duplicate filter logic elsewhere.
- WebSocket `NotificationsGateway` must validate the `Origin` header in `handleConnection()` against the allowed CORS origins before processing any token. This provides defense-in-depth alongside the `@WebSocketGateway` cors config.
- Frontend errors: use `toast.error()`, not just `throw` or `console.error`.
- Frontend mutation hooks: ALL `useMutation` hooks MUST have an `onError` callback with `toast.error(getErrorMessage(err, 'Operation failed'))` — silent failures leave users confused. This applies to ALL hooks: tickets, users, sla-configs, maintenance, telegram, notification-preferences, notifications.
- Frontend `ProtectedRoute`: the `navigateState` for `<Navigate>` redirect MUST use `useRef({ from: location }).current` (stable reference), NOT a plain object `{ from: location }` — a new object reference on every render causes infinite `<Navigate>` redirect loops.
- Frontend `Modal` Escape handler: use `useRef(onClose)` + stable `useCallback` with empty deps to prevent re-registering the `keydown` listener every time the parent passes a new `onClose` reference.
- Frontend `queryFilters` in list components: wrap in `useMemo` to prevent object reference instability — TanStack Query's deep-hashing is wasted on every render if a new object is created inline. Follow the `serializeQuery()` pattern from `use-dashboard.ts`.
- Backend Redis service: all core methods (`set`, `get`, `del`, `incr`, `eval`, `deleteByPattern`, etc.) must have try/catch with `Logger.error()` for observability. Callers that handle Redis failures (e.g., `AuthService.checkAccountLocked`) should use their own try/catch and fail open where appropriate.
- Backend auth fail-open: `checkAccountLocked()` and `resetFailedLogin()` must catch Redis errors and fail open (allow login through) rather than throwing 500 — a Redis outage should not block all logins.
- DTO validation: every numeric field must have `@IsInt() @Min(0)` (or appropriate bounds). `@IsString()` alone on IDs should be `@IsUUID()` where the field references a UUID primary key. Every enum field with `@IsEnum()` should also have `@IsNotEmpty()` so empty/undefined values are rejected at the validation layer rather than passing through to the service.
- Backend `faq.repository.ts` methods: ALL Prisma repository methods must be `async` even if they just return a Prisma promise — inconsistent `async`/non-async makes the code harder to refactor.
- nginx configs: always add `server_tokens off` to the `http` block. HTTP-only `nginx.conf` must have its own WebSocket rate limit zone (`ws_limit`). All CSP blocks must include `object-src 'none'`. The `frontend/nginx.conf` (used for production self-hosting) must be kept in sync with the main nginx for CSP hardening.
- WebSocket `NotificationsGateway` limits to `MAX_CONNECTIONS_PER_USER = 5` simultaneous connections per userId. Do not increase this without evaluating server resource boundaries.
- `RedisService.getClient()` was removed in Session 42. Use the typed methods (`setNx`, `set`, `get`, `del`, `eval`, etc.) instead of accessing the raw ioredis client.
- Frontend redesign: do not remove global CSS helper classes just because Tailwind classes are preferred. `card-body` is intentionally global and has regression coverage in `frontend/src/__tests__/global-styles.test.ts`.
- Backend errors: use `BadRequestException` / `NotFoundException` from `@nestjs/common`, not plain `Error`.
- Do not create a separate subcategory endpoint for listing; derive subcategories from existing `useCategories()` data (which includes `subCategories`).
- Telegram: do not send `botToken` or `groupChatId` to the frontend — only the `hasBotToken` / `hasGroupChatId` flags.
- Prisma `$queryRaw` tagged template: do not append type casts like `${arr}::uuid[]` to interpolated parameters — Prisma parameterizes the interpolation and PostgreSQL cannot cast parameter references. Use `${arr}` without cast; PostgreSQL handles type coercion implicitly.
- Backend errors: wrap Redis/Prisma calls that may fail during maintenance (e.g. `redisService.eval()`, `usersService.findById()`) in try/catch — non-`HttpException` errors produce 500 instead of graceful 401. The `HttpExceptionFilter` only catches `HttpException` subclasses.
- MIME validation: `assertMimeTypeIntegrity()` uses a `MIME_COMPATIBILITY_MAP` — OOXML files (`.docx`/`.xlsx`) are ZIP containers detected as `application/zip`, and legacy `.xls` shares the OLE CFB signature with `application/msword`. Do not reject these compatible mismatches; update the map if new container types are added.
- DTO validation: `CreateTicketDto` and `CreateCommentDto` use `@Transform(trimString)` + `@IsNotEmpty()` + `@MinLength()` — direct API clients cannot send whitespace-only payloads. Match these constraints when adding new text-field DTOs. Use `trimString` from `common/utils/transform.util.ts` for required fields and `trimOptionalString` for optional fields (returns `undefined` on blank input so `@IsOptional()` skips validation).
- `PartialType(CreateDto)` + default property values (`= 0`, `= true`) is a bug pattern: the defaults are applied before NestJS maps the request body, so PATCH endpoints receive defaults for fields the client did NOT send. Always remove defaults from the base DTO and provide them in the service `create()` method instead. Use `@IsOptional()` on optional fields to pass validation.
- Pagination `meta`: tickets, users, and notifications repositories always include `totalPages` (`Math.ceil(total / limit)`). New paginated endpoints must follow the same shape — do not omit `totalPages` even when `total === 0` (use `1` for the empty case). The `ApiResponse` interface officially includes `totalPages`.
- Repository type safety: avoid `as any` casts in repository methods — use Prisma generics (`Prisma.TicketGetPayload<{}>`, `Prisma.CommentGetPayload<{}>`, etc.) for return types. Methods with dynamic `include`/`select` should use explicit args construction (spread pattern) or cast through `unknown` (e.g., `as unknown as T`). The `as any` pattern is a known bug-incubation layer and should be replaced when encountered. As of Session 42, all production code has been cleared of `as any` and `as unknown` casts in repository methods (e.g., `TicketRepository.findById()` uses explicit `Prisma.TicketFindUniqueArgs` construction); remaining instances exist only in test files (acceptable trade-off for mock flexibility).
- Telegram config response: the `TelegramConfig` response from `GET /api/telegram/config` contains only `hasBotToken` + `hasGroupChatId` + `settings` (with `groupChatId` stripped). Do not add a `botToken` field even an empty string — it is a contract smell and risks copy-paste leaks.
- SLA recalculation: `SLAService` automatically recalculates `slaDueAt` and `slaStatus` for non-terminal tickets when SLA config timing is created or changed. `isActive`-only updates do not trigger recalculation. Frontend `SLAConfigManager` sends timing on every edit — the backend correctly skips recalculation if timing hasn't actually changed.
- Dashboard: the `TicketRepository` now has dashboard-specific methods (`getDashboardCurrentSnapshot`, `getDashboardAttentionTickets`, `getDashboardStatusCounts`, `getDashboardPriorityCounts`, `getDashboardSLAStatsForRange`, `getAvgResolutionTimeByCategoryForRange`, `getTopCategories`). Do not duplicate these query patterns; reuse the repository methods.
- Notification preferences: `User.notificationPreferences` is nullable JSONB. `null`/absent means all events enabled — do not treat `null` as "all off". The shared util `isEventEnabled(prefs, event)` handles this logic. The frontend `NotificationPreferencesSection` component uses `useNotificationPreferences()` which normalizes stored prefs per role via the API. Do not add preference checks outside `NotificationsService` handlers.
- File upload validation: use the shared `useFileUpload()` hook (frontend) for MIME type checks, size limits, preview URLs, and error management. The hook centralizes logic that was previously duplicated across `CreateTicketForm`, `CommentSection`, and `AttachmentList`. The hook cleans up blob URLs on unmount via `useEffect` — no manual cleanup needed by consumers.
- Stale-file cleanup: `AttachmentsService` runs a `@Cron('0 */6 * * *') cleanupOrphanedFiles()` that cross-references disk files against DB records and removes unmatched files. The `AttachmentRepository.findAllPaths()` method supports this. This is a best-effort guard against orphaned files from crashes during upload.
- **File save ordering**: `CommentsService.create()` saves uploaded files **inside** the Prisma transaction callback, not before it. This ensures that if the transaction fails (e.g., max attachments exceeded), no files linger on disk. A catch block inside the transaction handles cleanup of partial saves.
- **SLA lock sharing**: `SLAService.recalculateOpenTicketsForConfig()` (triggered by SLA config create/update) uses the same Redis lock key (`sla:check:lock`) as `checkSLA()` cron. If the cron is mid-flight when a config update triggers recalculation, the recalculation skips with a log message. This prevents concurrent writes to `slaDueAt`/`slaStatus` on overlapping ticket sets.
- **Restore safety**: `MaintenanceService.restoreDatabase()` wraps `DROP SCHEMA ... CASCADE` in a psql `BEGIN;...COMMIT` block. If the restore pipe (gzip→awk→psql) fails, the transaction is automatically rolled back and the original schema (with pre-restore backup data) is preserved.


## Dev Seed Credentials
- `admin@company.com / Admin123!`
- `support@company.com / Support123!`
- Production seed requires `SEED_ADMIN_PASSWORD` and `SEED_SUPPORT_PASSWORD` env vars.
