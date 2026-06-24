# IT Support Ticketing

## Purpose
- Compact project memory for agents; read before starting work.
- If this file conflicts with current code, trust the code and mention/update this file when relevant.
- Read `CHANGELOG.md` only for regression context, old decisions, or historical reasons.

## Stack Snapshot
- Backend: NestJS 10, Prisma 5, PostgreSQL 16, Redis 7, Socket.IO notifications.
- Frontend: React 18, Vite 5, TanStack Query 5, Zustand, Tailwind.
- API success: `{ data, meta? }`; paginated `meta` is `{ page, limit, total }`.
- API error: `{ error: { code, message } }` via `HttpExceptionFilter`.

## Work Style
- Stay inside the user's scope; if a path/page/endpoint is named, start there.
- Frontend bug: page -> related hook/component -> API/backend only if evidence points there.
- API bug: controller -> service -> repository.
- Backend change: keep service -> repository flow; new services inject repositories, not `PrismaService`.
- Verify narrowly with relevant test/build/lint only; do not run the whole stack unless needed.
- Preserve user changes; never revert/reset/checkout files without explicit request.

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
frontend/src/{auth,layout,pages,components,hooks,stores,types,lib}
```

## File Placement & Conventions
- Backend module files live in `backend/src/{module}/` with `module.ts`, `controller.ts`, `service.ts`, and `dto/`.
- Backend repositories live in `backend/src/common/repositories/`.
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
- Refresh token is an httpOnly cookie with path `/api/auth`; revoke via Redis key `refresh:{sub}:{jti}`.
- Cookie `secure` must match environment so local HTTP auth still works.
- `JWT_SECRET`, `DATABASE_URL`, and `REDIS_URL` are required at startup.
- `CORS_ORIGIN` is comma-separated. Code currently defaults to `https://helpdesk.rsmch.internal`; Docker local is HTTP-only, so set env explicitly when using an HTTP origin.
- Non-HTTP exceptions must not leak internal messages to clients.
- Password hash cost is bcrypt 12; seed uses `upsert` on restart.
- WebSocket clients disconnect when user is inactive (`isActive=false`).

## Roles & Access
| Role | Dashboard | New Ticket | My Account | Users | Master Data | Maintenance |
|------|-----------|------------|------------|-------|-------------|-------------|
| EndUser | No | Yes | Yes | No | No | No |
| ITSupport | Yes | Yes | Yes | No | No | No |
| Admin | Yes | Yes | Yes | Yes | Yes | Yes |

## Ticket Rules
- EndUser can create own tickets, view only own tickets, and close own `Resolved -> Closed` tickets.
- EndUser cannot comment, upload, or list attachments for tickets owned by another user.
- Internal comments and attachments are never returned/displayed to EndUser.
- ITSupport/Admin can access dashboard and operational ticket workflows.

## Maintenance Mode
- Flags live in Redis: `maintenance:enabled`, `maintenance:message`; Redis is not restored from backups.
- `MaintenanceGuard` is a global guard in `app.module.ts` and runs before `ThrottlerGuard`.
- Always allowed during maintenance: `/api/health`, `/api/maintenance/*`, `/api/auth/*`.
- Non-admin API calls during maintenance return `503 { error: { code: 'MAINTENANCE', message } }`.
- Use `@SkipMaintenance()` to skip checks on specific handlers.
- `restoreBackup()` enables maintenance, drains for 5 seconds before `DROP SCHEMA`, then disables it after restore.
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
- `frontend` service builds `frontend/Dockerfile` target `builder`, copies `/app/dist` to `frontend_dist`, then stays running.
- `nginx` serves static files from `frontend_dist:/usr/share/nginx/html` and proxies API traffic.
- `api` binds port `3000` to `127.0.0.1` for local debug; normal traffic goes through nginx `/api/`.
- Backup output lives in `backups/<timestamp>/{db.sql.gz,uploads.tar.gz,manifest.txt}` and `backups/` is gitignored.
- `db.sql.gz` covers public schema tables; Redis is not backed up.
- Admin UI `/admin/maintenance` can create/list/download/delete/restore backups with typed confirmation and pre-restore backup.
- API image includes `postgresql-client-16`, `gzip`, `tar`, and `gosu`; entrypoint chowns `/app/uploads` and `/app/backups`, then runs as `node`.

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
- Attachment relates to ticket, user, and optional comment.
- `SLAConfig` is unique on `(categoryId, priority)`.

## Dev Seed Credentials
- `admin@company.com / Admin123!`
- `support@company.com / Support123!`
