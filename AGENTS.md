# IT Support Ticketing

## Purpose
- Compact project memory for agents; read before starting work.
- If this file conflicts with current code, trust the code and mention/update this file when relevant.
- Read `CHANGELOG.md` for regression context and historical changes (performance, bug fixes, security sessions 2–4); do not duplicate that history here.

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
- Phase 1 — Context: use the Project Structure & API Map here as the initial map; look up specific files directly, do not recursively scan first. Read at most 3–5 files before Planning. No edits before context gathering is complete.
- Phase 2 — Planning: for >1-file tasks, write a change plan first (`path/to/file.ts` → 1-sentence change; for bugs, root cause in 1 sentence; flag behavior changes; readable in 30s). Ask confirmation only if info cannot be derived from codebase/AGENTS.md — max 1 question per cycle.
- Phase 3 — Execution: narrowest change within scope; no unrequested features/refactors; prefer reversible actions; avoid destructive ops without confirmation; one logical change = one commit.
- Phase 4 — Verification: run test/lint/build relevant to the changed area; if not relevant/cannot run, report why; on failure, analyze→fix→repeat; never declare done until verification passes or limitations explained.
- Phase 5 — Reporting: summarize files changed, reasons, verification run + evidence; explicitly flag behavior changes humans must know.

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
backend/src/common/utils/{upload,mime-validation}.util.ts
frontend/src/{auth,layout,pages,components,hooks,stores,types,lib}
postgres/postgresql.conf
```

## File Placement & Conventions
- Backend module files live in `backend/src/{module}/` with `module.ts`, `controller.ts`, `service.ts`, and `dto/`.
- Backend repositories live in `backend/src/common/repositories/`.
- Backend policies live in `backend/src/common/policies/` (e.g., `AttachmentVisibilityPolicy`).
- Backend shared utilities live in `backend/src/common/utils/` (e.g., `upload.util.ts`, `mime-validation.util.ts`).
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
- Refresh token is an httpOnly cookie with path `/api/auth`; revoke via Redis key `refresh:{sub}:{jti}`. Refresh token rotation uses atomic Lua GETDEL to prevent replay.
- Refresh TTL via `JWT_REFRESH_TOKEN_EXPIRY` env; cookie maxAge follows env.
- Logout is cookie-based (no access token required); always clears refresh cookie and revokes Redis key.
- `JwtAuthGuard` is a global guard (fail-closed); use `@Public()` to exempt public endpoints (health, auth login/refresh/logout, `maintenance/mode` GET).
- Cookie `secure` defaults to `x-forwarded-proto` check; override with `COOKIE_SECURE=true/false` env.
- `JWT_SECRET`, `DATABASE_URL`, and `REDIS_URL` are required at startup; production requires min 32-char `JWT_SECRET` and `REDIS_PASSWORD`.
- Account locks after 10 failed logins (Redis tracking, 15-min window). Lockout counter uses atomic Lua INCR+EXPIRE to prevent permanent lock on partial Redis failure.
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
- `updateStatus()` is atomic: conditional `updateMany({ where: { id, status: oldStatus } })` → 409 Conflict on race.

## Maintenance Mode
- Flags live in Redis: `maintenance:enabled`, `maintenance:message`; Redis is not restored from backups.
- `MaintenanceGuard` is a global guard in `app.module.ts` and runs before `ThrottlerGuard`.
- `MaintenanceGuard` uses a 2-second in-memory cache + Redis `mget` to reduce round-trips. Allowed paths (`/health`, `/maintenance/*`, `/auth/*`) are checked BEFORE Redis; if Redis is unreachable, guard defaults to allow (fail-open).
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
- `api`, `db`, and `cache` services read from `backend/.env` via `env_file`; `cache` requires `REDIS_PASSWORD` and starts Redis with `requirepass` + `maxmemory 400mb` + `maxmemory-policy allkeys-lru`.
- `db` uses a custom `postgres/postgresql.conf` (`listen_addresses='*'`, `shared_buffers=512MB`, `work_mem=16MB`, `effective_cache_size=1536MB`) and `shm_size: 1g` for parallel query performance. `listen_addresses='*'` is required so PostgreSQL binds to the Docker network interface instead of only localhost.
- Backup output lives in `backups/<timestamp>/{db.sql.gz,uploads.tar.gz,manifest.txt}` and `backups/` is gitignored.
- `db.sql.gz` covers public schema tables; Redis is not backed up.
- Admin UI `/admin/maintenance` can create/list/download/delete/restore backups with typed confirmation and pre-restore backup.
- API image includes `postgresql-client-16`, `gzip`, `tar`, and `gosu`; entrypoint chowns `/app/uploads` and `/app/backups`, runs migrations with 3-retry loop, runs seed (dev mode or `SEED_ON_START=true`), then runs as `node`.
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
- Do not create a separate subcategory endpoint for listing; derive subcategories from existing `useCategories()` data (which includes `subCategories`).
- Telegram: do not send `botToken` or `groupChatId` to the frontend — only the `hasBotToken` / `hasGroupChatId` flags.
- Prisma `$queryRaw` tagged template: do not append type casts like `${arr}::uuid[]` to interpolated parameters — Prisma parameterizes the interpolation and PostgreSQL cannot cast parameter references. Use `${arr}` without cast; PostgreSQL handles type coercion implicitly.

## Dev Seed Credentials
- `admin@company.com / Admin123!`
- `support@company.com / Support123!`
- Production seed requires `SEED_ADMIN_PASSWORD` and `SEED_SUPPORT_PASSWORD` env vars.

