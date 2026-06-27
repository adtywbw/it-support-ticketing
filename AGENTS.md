# IT Support Ticketing

## Purpose
- Compact project memory for agents; read before starting work.
- If this file conflicts with current code, trust the code and mention/update this file when relevant.
- Read `CHANGELOG.md` only for regression context, old decisions, or historical reasons.

## Stack Snapshot
- Backend: NestJS 10, Prisma 5, PostgreSQL 16, Redis 7, Socket.IO notifications.
- Frontend: React 18, Vite 5, TanStack Query 5, Zustand, Tailwind.
- API success: `{ data, meta? }` (enforced globally via `TransformInterceptor`); paginated `meta` is `{ page, limit, total, totalPages? }`.
- API error: `{ error: { code, message } }` via `HttpExceptionFilter` (stable codes: `BAD_REQUEST`, `NOT_FOUND`, `MAINTENANCE`, etc.).

## Work Style
- Stay inside the user's scope; if a path/page/endpoint is named, start there.
- Frontend bug: page -> related hook/component -> API/backend only if evidence points there.
- API bug: controller -> service -> repository.
- Backend change: keep service -> repository flow; new services inject repositories, not `PrismaService`.
- Verify narrowly with relevant test/build/lint only; do not run the whole stack unless needed.
- Preserve user changes; never revert/reset/checkout files without explicit request.

## Mandatory Agentic Loop
- Phase 1 - Context Gathering: use the Project Structure and API Map in AGENTS.md as the initial map — do not recursively scan directories first. Directly look up the specific files relevant to the task. If a file is not found via targeted lookup, only then do a limited directory scan. Read at most 3–5 files before moving to Planning.
- Do not edit files before context gathering is complete.
- Phase 2 - Planning: for tasks touching more than 1 file, write a change plan before executing.
- Planning format (compact): `path/to/file.ts` → what changes (1 sentence). For bugs: root cause in 1 sentence. Flag any behavior changes. Keep it concise — the plan must be readable in 30 seconds.
- For bugs, identify the root cause first, then compose the fix plan.
- Ask for human confirmation ONLY if the required information cannot be derived from the codebase or this AGENTS.md. Maximum 1 question per cycle; combine all ambiguities into a single message.
- Phase 3 - Execution: make changes as narrow as possible within the task scope.
- Do not add unrequested features, refactors, or improvements.
- Prefer reversible actions and avoid destructive operations without explicit confirmation.
- If asked to commit, one logical change = one commit; do not batch unrelated changes.
- Phase 4 - Verification: after edits, run the test/lint/build relevant to the changed area.
- If verification is not relevant or cannot be run, report the reason.
- If test/lint/build fails, read the error, analyze, fix, then repeat verification.
- Do not declare done until relevant verification passes or its limitations are explained.
- Phase 5 - Reporting: summarize files changed, reasons for changes, verification run, and evidence of successful verification.
- Explicitly flag any behavior changes that humans need to be aware of.

## Non-Negotiable Rules
- Do not persist access tokens in `localStorage`, `sessionStorage`, or other persistent storage.
- Do not add hardcoded fallbacks for `JWT_SECRET`, `DATABASE_URL`, or `REDIS_URL`.
- Do not expose EndUser to Dashboard, `/admin`, other users' tickets, or internal comments/attachments.
- Do not send Telegram bot token/group chat secrets to frontend; return flags such as `hasBotToken`/`hasGroupChatId`.
- Do not run `docker compose down -v` or destructive Git commands unless explicitly requested.
- Do not change Docker/HTTP/HTTPS flow unless requested; check Docker & HTTP notes first.
- Maintenance and backup/restore operations remain Admin-only.

## Verification Commands
| Area | Workdir | Command |
|------|---------|---------|
| Backend unit tests | `backend` | `npm test` |
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
backend/src/{auth,tickets,comments,attachments,categories,sub-categories,dashboard,users,sla,notifications,telegram,maintenance,health}
backend/src/common/repositories/{user,ticket,comment,attachment,category,sub-category,sla-config,notification,telegram-config}.repository.ts
backend/src/common/policies/attachment-visibility.policy.ts
frontend/src/{auth,layout,pages,components,hooks,stores,types,lib}
```

## File Placement & Conventions
- Backend module files live in `backend/src/{module}/` with `module.ts`, `controller.ts`, `service.ts`, and `dto/`.
- Backend repositories live in `backend/src/common/repositories/`.
- Backend policies live in `backend/src/common/policies/` (e.g., `AttachmentVisibilityPolicy`).
- Frontend pages: `frontend/src/pages/`.
- Frontend components: `frontend/src/components/{domain}/`.
- Frontend hooks: `frontend/src/hooks/` for TanStack Query hooks.
- Frontend stores: `frontend/src/stores/` for Zustand.
- Frontend `types/` and `lib/` hold shared types, axios client, and utilities.
- Use `kebab-case` files, `PascalCase` components/classes, and `camelCase` variables/functions.
- Frontend uses functional components, named exports, Tailwind utilities, and `@/` alias.
- Do not add CSS modules or styled-components.
- Backend imports are relative within modules.
- DTO validation uses `class-validator` with `whitelist` and `forbidNonWhitelisted`.
- Throw `BadRequestException`/`NotFoundException` on backend; use `toast.error()` on frontend.

## State Management
- TanStack Query owns server state: tickets, users, categories, notifications, dashboard stats.
- Zustand persisted state: theme only.
- Zustand non-persisted state: auth user/accessToken and notification count.
- React state owns form and component-local UI state.

## Auth & Security
- Access token is memory-only in Zustand auth state.
- Access token has `tokenType: 'access'` claim; refresh token has `tokenType: 'refresh'`.
- Refresh token is an httpOnly cookie with path `/api/auth`; revoke via Redis key `refresh:{sub}:{jti}`.
- Logout is cookie-based (no access token required); always clears refresh cookie and revokes Redis key.
- Cookie `secure` defaults to `x-forwarded-proto` check; override with `COOKIE_SECURE=true/false` env.
- `JWT_SECRET`, `DATABASE_URL`, and `REDIS_URL` are required at startup; production requires min 32-char `JWT_SECRET` and `REDIS_PASSWORD`.
- `CORS_ORIGIN` is comma-separated. Code currently defaults to `https://helpdesk.rsmch.internal`; Docker local is HTTP-only, so set env explicitly when using an HTTP origin.
- Non-HTTP exceptions must not leak internal messages to clients.
- Password hash cost is bcrypt 12; seed uses `upsert` on restart.
- WebSocket clients disconnect when user is inactive (`isActive=false`).
- Upload filenames are generated server-side (`uuid + safe extension`); `originalName` stored in DB for display only.
- Telegram config API response strips `groupChatId`; only `hasBotToken`/`hasGroupChatId` flags returned to frontend.

## Roles & Access
| Role | Dashboard | New Ticket | My Account | Users | Master Data | Maintenance |
|------|-----------|------------|------------|-------|-------------|-------------|
| EndUser | No | Yes | Yes | No | No | No |
| ITSupport | Yes | Yes | Yes | No | No | No |
| Admin | Yes | Yes | Yes | Yes | Yes | Yes |

## Ticket Rules
- EndUser can create own tickets, view only own tickets, and close own `Resolved -> Closed` tickets.
- EndUser cannot comment, upload, or list attachments for tickets owned by another user.
- Internal comments and internal attachments are never returned/displayed to EndUser.
- Attachment visibility is centralized via `AttachmentVisibilityPolicy` in `backend/src/common/policies/`.
- EndUser sees only PUBLIC direct attachments and attachments from PUBLIC comments.
- ITSupport/Admin can access dashboard and operational ticket workflows.

## Maintenance Mode
- Flags live in Redis: `maintenance:enabled`, `maintenance:message`; Redis is not restored from backups.
- `MaintenanceGuard` is a global guard in `app.module.ts` and runs before `ThrottlerGuard`.
- Always allowed during maintenance: `/api/health`, `/api/maintenance/*`, `/api/auth/*`.
- Non-admin API calls during maintenance return `503 { error: { code: 'MAINTENANCE', message } }`.
- Use `@SkipMaintenance()` to skip checks on specific handlers.
- `restoreBackup()` enables maintenance, drains for 5 seconds before `DROP SCHEMA`, then disables it after restore only if restore succeeded.
- Frontend `MaintenanceBanner` polls `/api/health` every 5 seconds.
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
- Docker local is HTTP only; nginx listens on port 80 and HTTPS is disabled for local development.
- Domain: `helpdesk.rsmch.internal` via AdGuard Home DNS rewrite.
- Cert files under `nginx/certs/` are gitignored placeholders if SSL is re-enabled later.
- To re-enable SSL, update `nginx.conf`, expose port 443 in `docker-compose.yml`, and generate certs with `mkcert`.
- **Lockfile compatibility**: after running `npm install` or `npm update` locally, regenerate lockfiles with the Docker node version to prevent `npm ci` failures: `docker run --rm -v "$(pwd)/frontend":/app -w /app node:20-alpine npm install --package-lock-only` and `docker run --rm -v "$(pwd)/backend":/app -w /app node:20-bookworm-slim npm install --package-lock-only`.
- `frontend` service builds `frontend/Dockerfile` target `builder`, copies `/app/dist` to `frontend_dist`, then stays running.
- `nginx` serves static files from `frontend_dist:/usr/share/nginx/html` and proxies API traffic.
- `nginx` also proxies `/socket.io/` with WebSocket upgrade headers for realtime notifications.
- `api` binds port `3000` to `127.0.0.1` for local debug; normal traffic goes through nginx `/api/`.
- `api`, `db`, and `cache` services read from `backend/.env` via `env_file`; `cache` requires `REDIS_PASSWORD` and starts Redis with `requirepass`.
- Backup output lives in `backups/<timestamp>/{db.sql.gz,uploads.tar.gz,manifest.txt}` and `backups/` is gitignored.
- `db.sql.gz` covers public schema tables; Redis is not backed up.
- Admin UI `/admin/maintenance` can create/list/download/delete/restore backups with typed confirmation and pre-restore backup.
- API image includes `postgresql-client-16`, `gzip`, `tar`, and `gosu`; entrypoint chowns `/app/uploads` and `/app/backups`, then runs as `node`.
- Redis has no persistence volume. Refresh tokens and maintenance flags are lost on `cache` container recreate. This is an intentional tradeoff: mass logout on Redis restart is acceptable for this deployment.

## API Map
- Health: `GET /api/health` includes maintenance status.
- Auth: `POST /api/auth/login|refresh|logout|change-password`.
- Tickets: `GET|POST /api/tickets`, `GET|PATCH|DELETE /api/tickets/:id`, `PATCH /api/tickets/:id/status|assign|priority`, `GET /api/tickets/export/csv`.
- Ticket children: `GET|POST /api/tickets/:id/comments|attachments`; EndUser sees only own visible resources.
- Categories: `GET|POST|PATCH|DELETE /api/categories` and `/api/categories/:categoryId/sub-categories`.
- Deprecated sub-category shortcuts: `PATCH|DELETE /api/sub-categories/:id`; prefer full category path.
- SLA: `GET|POST|PATCH /api/sla-configs`.
- Dashboard: `GET /api/dashboard/stats`.
- Users: `GET|POST|PATCH|DELETE /api/users`; `GET ?includeInactive=true` includes inactive users.
- Notifications: `GET|PATCH|DELETE /api/notifications`; supports clear-all, read-all, and mark-read operations.
- Telegram: `GET /api/telegram/status|config`, `POST /api/telegram/link|test-notification|check`, `DELETE /api/telegram/link`, `PUT /api/telegram/config`.
- Maintenance: `/api/maintenance/mode`, `/api/maintenance/backups`, restore, download, and delete endpoints.

## Models
- Models: User, Ticket, Comment, Attachment, Category, SubCategory, SLAConfig, TicketHistory, Notification, TelegramConfig.
- Ticket relates to requester user, assignee user, category, and sub-category.
- Comment relates to ticket and user.
- Attachment relates to ticket, user, optional comment, and has `visibility` (`PUBLIC`/`INTERNAL`).
- `SLAConfig` is unique on `(categoryId, priority)`.
- `TelegramConfig` is singleton enforced by `key` column (`@unique @default("default")`); repository uses `findOrCreate()` on the fixed key.

## Key Model Fields (anti-hallucination)
- `Ticket`: `ticketNumber` (from sequence, not MAX), `status`, `priority`; `visibility` does not exist on the Ticket model — visibility belongs to `Attachment`.
- `Attachment`: `visibility: PUBLIC | INTERNAL`, `originalName` (for display only), filename on disk = uuid + safe extension.
- `Comment`: there is no `isInternal` boolean field — use the `type: CommentType` field (`PUBLIC`|`INTERNAL`). Internal attachment visibility is controlled via `AttachmentVisibilityPolicy`.
- `TelegramConfig`: singleton, always accessed via `key = "default"`, use `findOrCreate()` from the repository — do not call `findFirst()` or `create()` directly.
- `Notification`: clear-all, read-all, mark-read are supported by the API — check the API Map before adding new endpoints.
- `SLAConfig`: unique constraint on `(categoryId, priority)` — upsert on create/update.

## Common Pitfalls
- Do not inject `PrismaService` directly into new services; always go through the repository in `common/repositories/`.
- `TransformInterceptor` already wraps responses into `{ data, meta? }` globally — do not manually wrap in controllers.
- `AttachmentVisibilityPolicy` is the single source of truth for attachment visibility — do not duplicate filter logic elsewhere.
- Frontend errors: use `toast.error()`, not just `throw` or `console.error`.
- Backend errors: use `BadRequestException` / `NotFoundException` from `@nestjs/common`, not plain `Error`.
- Do not create a separate subcategory endpoint for listing; derive from existing categories data (see MasterData in Performance Optimizations).
- Telegram: do not send `botToken` or `groupChatId` to the frontend — only the `hasBotToken` / `hasGroupChatId` flags.

## Dev Seed Credentials
- `admin@company.com / Admin123!`
- `support@company.com / Support123!`
- Production seed requires `SEED_ADMIN_PASSWORD` and `SEED_SUPPORT_PASSWORD` env vars.

## Performance Optimizations (CODE_REVIEW.md Session 2)
- Ticket number: PostgreSQL sequence `ticket_number_seq` — O(1) `nextval()`, not `MAX(SUBSTRING)` full scan. Default transaction isolation (not Serializable).
- SLA cron: keyset pagination `id > lastId` (not offset `skip: processed`).
- EndUser ticket list: batch aggregate count via `$queryRaw` — not N+1 per-ticket.
- Dashboard: Redis cache TTL 30 seconds + SQL aggregation for SLA stats & daily trends.
- Database indexes: 15+ indexes added in migration `20260626001000_add_perf_indexes`, including `pg_trgm` GIN indexes for ILIKE search.
- MaintenanceGuard: 2-second in-memory cache + `mget` — reduces Redis round-trips per request.
- LocalStorage: async `fs/promises` (not sync blocking).
- Notifications/Telegram: concurrency limit 3-5 via `runWithConcurrency`.
- Frontend: route-level `React.lazy()` code splitting, nginx static asset immutable cache, TanStack Query staleTime tuning (categories 30m, assignable 10m).
- MasterData: subcategories derived from categories data (no N+1 requests).
- RedisService: add `mget()` method for atomic multi-key get.

## Bug Fixes (CODE_REVIEW.md Session 3)
- **Restore safety**: maintenance remains enabled when restore fails; the pre-restore backup ID is returned in the error message.
- **Docker env**: `backend/.env.compose.example` (canonical, including `REDIS_PASSWORD`), `backend/.env.local.example` (local dev).
- **Attachment visibility**: EndUser `findMany`/`count` uses `AttachmentVisibilityPolicy.buildVisibleAttachmentWhere()` — post-query filter removed.
- **WebSocket refresh**: `useSocket()` re-creates the socket when `accessToken` changes via Zustand selector.
- **Upload atomic**: direct attachment & comment creation uses a Prisma transaction; file cleanup if DB insert fails.
- **Status race**: `updateStatus()` uses conditional `updateMany({ where: { id, status: oldStatus } })` + 409 Conflict.
- **User deactivation**: emit `user.deactivated` → revoke refresh tokens + disconnect sockets.
- **Category EndUser**: `GET /categories` returns minimal fields for EndUser (`findForTicketForm`); Admin remains full.
- **Telegram polling**: generation counter + timeout handle — stale loops auto-stop.
- **Backup script**: refuses when maintenance is off; `--live-ok` flag for live backup.
- **Pagination DTO**: `PaginationQueryDto` with `@Type(Number)`, `@IsInt`, `@Min(1)`, `@Max(100)`.
- **Telegram config**: typed DTOs (`UpdateTelegramConfigDto`, `CheckTelegramConfigDto`) + event whitelist validation.
- **SLA errors**: category existence precheck + Prisma P2002/P2025 → Conflict/NotFound.
- **Frontend toasts**: all mutation/export/download failures now use `toast.error()`.
- **Pagination clamp**: `TicketList`, `AttachmentList`, `CommentSection` auto-adjust page when totalPages shrinks.
- **VITE_API_URL**: axios `baseURL`, refresh, and socket now use `import.meta.env.VITE_API_URL || '/api'`.
- **Redis healthcheck**: `REDISCLI_AUTH` env (not `-a`); config file via `umask 077`.
- **Nginx**: remove `set_real_ip_from` private ranges + `real_ip_header`.
- **Login redirect**: respect `location.state.from` from `ProtectedRoute`.
- **Notification count**: invalidate `notifications-unread-count` query after mark-read.
- **Telegram subject**: `ticket.assigned` event include `subject: ticket.subject`.
- **Thumbnail cache**: LRU limit 100 entries + revoke evicted URLs.
- **DTO trim**: `@Transform(trimString)` + `@IsNotEmpty()` + `@MaxLength()` in category, subcategory, user DTOs.

## Security Fixes (CODE_REVIEW.md Session 4)
- **SEC-001**: `validateEnv()` di `main.ts` sekarang enforce `COOKIE_SECURE=true` di production. `.env` diubah ke `NODE_ENV=development` untuk local HTTP-only dev.
- **SEC-002**: `JwtStrategy` dan `NotificationsGateway` sekarang explicit check `payload.tokenType !== 'access'` (sebelumnya truthy guard bypass token tanpa `tokenType`). `JwtPayload.tokenType` sekarang required (hapus `?`).
- **SEC-003**: Account lockout setelah 10 failed login attempts (Redis tracking, 15 menit lock window). `RedisService` tambah `incr()` dan `expire()`.
- **SEC-004**: Nginx security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) sekarang di-repeat di setiap `location` block yang punya `add_header` sendiri.
- **SEC-005**: Content-Security-Policy header ditambahkan untuk frontend SPA di nginx.
- **SEC-006**: `backend/.env` permission diubah ke `600` (owner-only).
- **SEC-007**: `.gitignore` sekarang cover `.env.*` variants dengan `!.env.*.example` exception.
- **SEC-008**: Docker container hardening: `security_opt: no-new-privileges`, `cap_drop: ALL`, `cap_add` minimal, `mem_limit`, `cpus`, `pids_limit` untuk semua service.
- **SEC-009**: `CommentRepository.findByTicketId()` sekarang `select` (bukan `include`) untuk attachments — exclude `path` field dari response.
- **SEC-010**: `AuthService.validateUser()` lakukan dummy bcrypt compare untuk user-not-found (timing side-channel mitigation).
- **SEC-013**: `JwtAuthGuard` sekarang global guard dengan `@Public()` decorator exemption. Fail-closed: controller tanpa `@Public()` require auth. `@Public()` di `HealthController`, `AuthController` (login/refresh/logout), `MaintenanceController.getMode()`.
- **SEC-014**: `CommentsController.create()` sekarang gunakan `CreateCommentDto` class (enable ValidationPipe: `@MaxLength(10000)` pada content, `@IsEnum(CommentType)` pada type).
- **SEC-015**: File extension whitelist di `buildSafeUploadPath()` — shared utility `backend/src/common/utils/upload.util.ts`. Extension di-filter ke whitelist; non-whitelist disimpan tanpa extension.
- **SEC-016**: `originalName` di-sanitize (`path.basename()` + `substring(0, 255)`) sebelum disimpan ke DB.
- **SEC-017**: Telegram link code: 8 random bytes → 8 chars base64url, case-sensitive (sebelumnya 4 bytes, 6 chars, toUpperCase).
- **SEC-018**: Redis lock release di `MaintenanceService` sekarang atomic via Lua script (sebelumnya GET-then-DEL TOCTOU race).
- **SEC-019**: `setMaintenanceMode(false)` sekarang check `RESTORE_LOCK_KEY` — refuse disable maintenance saat restore aktif.
- **SEC-020**: Infrastructure credentials di `.env` di-generate dengan `openssl rand` (sebelumnya `ticket123`, `redis123`).
- **SEC-023**: Separate env files: `backend/.env.db` (hanya DB vars), `backend/.env.cache` (hanya Redis password). Least-privilege.
- **SEC-025**: `LoginDto` dan `ChangePasswordDto` tambah `@MaxLength(128)` pada password fields.
- **SEC-026**: Magic byte signatures tambah `application/msword` (OLE2). Text file integrity check: reject files dengan null bytes untuk `text/plain`/`text/csv`.
- **SEC-028**: Refresh TTL sekarang baca dari `JWT_REFRESH_TOKEN_EXPIRY` env (sebelumnya hardcoded 7 hari). Cookie maxAge juga mengikuti env.
- **SEC-029**: `changePassword()` sekarang `res.clearCookie(REFRESH_COOKIE)` setelah revocation.
- **SEC-033**: Frontend `use-auth.ts` validate `from.pathname` starts with `/` (open redirect mitigation).
- **SEC-034**: `CreateTicketForm` tambah MIME type validation (sebelumnya hanya size check).
- **SEC-036**: `ErrorBoundary` guard `console.error` dengan `import.meta.env.DEV`.
- **SEC-037**: `UserManagement` ganti `alert()` dengan `toast.error()`.
- **SEC-038**: `CreateTicketDto.description` tambah `@MaxLength(10000)`.
- **SEC-039**: `QueryTicketDto` ID fields (`categoryId`, `assignedToId`, `requesterId`) ubah dari `@IsString()` ke `@IsUUID()`.
- **SEC-040**: `QueryTicketDto.search` tambah `@MaxLength(200)`.
- **SEC-042**: Download `Cache-Control` ubah dari `private, max-age=86400` ke `private, no-cache`.
- **SEC-043**: `MAX_FILES_PER_TICKET` (5) check ditambahkan di `CommentsService.create()`.
- **SEC-045**: `UserRepository.findWithTelegramCode()` tambah `select` untuk exclude `password` hash.
- **SEC-046**: `TelegramService.getConfig()` dan `updateConfig()` sekarang gunakan `findOrCreate()` dari repository (sebelumnya `findFirst()` + `create()` langsung).
- **SEC-047**: `UsersService.create()` reactivation response tambah `reactivated: true` flag.
- **SEC-048**: `UsersService.delete()` prevent self-deletion (`id === requesterId` → `BadRequestException`).
- **SEC-049**: Nginx tambah `default_server` block untuk unmatched Host headers (`return 444`).
- **SEC-050**: Nginx tambah `location ~ /\. { deny all; }` untuk dotfile protection.
- **SEC-051**: `frontend/nginx.conf` tambah security headers dan CSP.
- **SEC-052**: Root `.env.example` ditandai deprecated (redirect ke `backend/.env.compose.example`).
- **SEC-053**: `scripts/backup.sh` manifest hapus `postgres_user` (info leak).
- **SEC-055**: `QueryUsersDto.search` tambah `@MaxLength(200)`, `role` ubah ke `@IsEnum(Role)`.
- **SEC-056**: `RedisService` tambah optional TLS support (`REDIS_TLS=true` env).
- **SEC-057**: JWT secret di `.env` di-generate dengan `openssl rand -hex 64` (128 hex chars).
- **SEC-059**: Tambah GitHub Actions CI workflow (`.github/workflows/ci.yml`).
- **SEC-060**: `as any` di `user.repository.ts` — noted but not fully refactored (low priority, type safety improvement).
