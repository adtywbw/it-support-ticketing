# Architecture Documentation — IT Support Ticketing

## 1. Architecture Overview

### Container Diagram (text-based)

```
  ┌───────────────────┐   docker build        ┌──────────────────┐
  │  Frontend Builder │── target: builder ────▶│  frontend_dist  │
  │  (vite build)     │   cp /app/dist/*       │  (named volume) │
  └───────────────────┘   → /export/           └────────┬─────────┘
                                                         │
                                                         ▼
  ┌──────────┐     ┌──────────────┐    ┌──────────────────┐
  │ Browser  │────▶│  Nginx :80   │◀───│ /usr/share/      │
  │          │     │  reverse     │    │ nginx/html       │
  └──────────┘     │  proxy       │    └──────────────────┘
                   └──────┬───────┘
                          │  /api/
                        ▼
                 ┌──────────────┐
                 │ NestJS (:3000)│
                 └───┬──────┬───┘
                     │      │
               ┌─────┘      └──────┐
               ▼                    ▼
        ┌──────────────┐  ┌──────────────────┐
        │ PostgreSQL   │  │  Redis 7          │
        │     16       │  │ (tokens, lock,    │
        └──────────────┘  │  cache, cron)     │
                          └──────────────────┘
```

### Stack Justification

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Backend | NestJS + TypeScript | Opinionated, modular, built-in DI, guards, pipes, interceptors. Natural fit for enterprise-grade REST API. |
| Frontend | React 18 + Vite | Fast dev/build, TanStack Query for server state caching/refetching, Zustand for minimal client state. |
| Database | PostgreSQL 16 | Mature, JSON support, excellent Prisma integration. |
| Cache | Redis 7 | Password-protected refresh token store, maintenance flags, backup lock, cron job lock for horizontal scaling. |
| Reverse Proxy | Nginx | Single entry point, rate limiting, security headers, static file serving, reverse proxy. |
| Containerization | Docker (Debian bookworm-slim) | Reproducible deployment, identical dev/prod environment. Debian base chosen over Alpine for native OpenSSL 3.x compatibility with Prisma engines. |
| ORM | Prisma | Type-safe query builder, auto-generated types, migrations. |
| Repository Pattern | Domain Repositories | Abstraction layer over PrismaService — services depend on repositories instead of ORM directly. Enables testability and DB-agnostic business logic. |

---

## 2. Repository Pattern

Business logic services (`TicketsService`, `UsersService`, etc.) depend on **domain repositories** (`TicketRepository`, `UserRepository`, etc.) instead of injecting `PrismaService` directly. This abstraction layer provides:

- **Testability** — services can be unit-tested with mock repositories instead of mocking the entire Prisma client
- **Separation of concerns** — data access logic is encapsulated in repositories; services focus on business rules
- **DB-agnosticism** — if the ORM changes, only repositories need updating, not services

### Repository List

| Repository | Prisma Model | Used By |
|------------|-------------|---------|
| `UserRepository` | `user` | `JwtStrategy`, `UsersService`, `TicketsService`, `NotificationsService`, `NotificationsGateway`, `TelegramService` |
| `TicketRepository` | `ticket` | `TicketsService`, `CommentsService`, `AttachmentsService`, `SLAService`, `DashboardService` |
| `CommentRepository` | `comment` | `CommentsService` |
| `AttachmentRepository` | `attachment` | `AttachmentsService`, `CommentsService` |
| `CategoryRepository` | `category` | `CategoriesService`, `TicketsService`, `SLAService` |
| `SubCategoryRepository` | `subCategory` | `SubCategoriesService`, `TicketsService` |
| `SlaConfigRepository` | `sLAConfig` | `SLAService` |
| `NotificationRepository` | `notification` | `NotificationsService` |
| `TelegramConfigRepository` | `telegramConfig` | `TelegramService` |

The `MaintenanceModule` is intentionally operational rather than domain-persistent: it uses filesystem access and OS tools (`pg_dump`, `gzip`, `tar`) to create, download, and delete backups under `/app/backups`, and is restricted to Admin users. It also manages a maintenance mode flag stored in Redis that blocks non-admin API requests via `MaintenanceGuard` while allowing Admin through via JWT verification.

All repositories are exported from `RepositoriesModule` (marked `@Global()`) and registered once in `AppModule` — no per-module imports needed, mirroring the pattern used by `PrismaModule`.

---

## 3. Database Schema (ERD Textual)

```
┌─────────────────────────────────────────────────────────────────────┐
│ users
│ PK id (UUID)
│ email (UNIQUE)             VARCHAR
│ password                   VARCHAR
│ name                       VARCHAR
│ role                       Role (EndUser|ITSupport|Admin)
│ isActive                   Boolean
│ avatarUrl                  VARCHAR? (nullable)
│ telegramChatId             VARCHAR? (nullable, UNIQUE)
│ telegramCode               VARCHAR? (nullable, UNIQUE)
│ telegramCodeAt             DateTime? (nullable)
│ createdAt                  DateTime
│ updatedAt                  DateTime
│ INDEXES: (email), (role), (role, isActive)
│ 1──< tickets (requesterId)
│ 1──< tickets (assignedToId)
│ 1──< comments
│ 1──< attachments
│ 1──< notifications
│ 1──< ticket_history
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ tickets
│ PK id (UUID)
│ ticketNumber (UNIQUE)      VARCHAR   TKT-XXX
│ subject                     VARCHAR(255)
│ description                 TEXT
│ FK requesterId → users      UUID
│ FK categoryId → categories  UUID
│ FK subCategoryId → sub_categories  UUID? (nullable)
│ priority                  Priority  (Low|Medium|High|Critical)
│ status                   TicketStatus (Open|InProgress|OnHold|Resolved|Closed)
│ FK assignedToId → users    UUID? (nullable)
│ channel                   Channel  (Web)
│ slaDueAt                  DateTime
│ slaStatus                 SLAStatus (OnTrack|AtRisk|Breached)
│ resolvedAt                DateTime? (nullable)
│ closedAt                  DateTime? (nullable)
│ createdAt                  DateTime
│ updatedAt                  DateTime
│ INDEXES: (status), (assignedToId), (requesterId), (createdAt),
│          (slaDueAt), (priority)
│ 1──< comments
│ 1──< attachments
│ 1──< ticket_history
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ categories
│ PK id (UUID)
│ name (UNIQUE)              VARCHAR
│ description                VARCHAR? (nullable)
│ isActive                   Boolean
│ createdAt                  DateTime
│ updatedAt                  DateTime
│ 1──< sub_categories (categoryId)
│ 1──< tickets (categoryId)
│ 1──< sla_configs (categoryId)
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ sub_categories
│ PK id (UUID)
│ FK categoryId → categories  UUID
│ name                       VARCHAR
│ description                VARCHAR? (nullable)
│ isActive                   Boolean
│ createdAt                  DateTime
│ updatedAt                  DateTime
│ UNIQUE: (categoryId, name)
│ 1──< tickets (subCategoryId)
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ comments
│ PK id (UUID)
│ FK ticketId → tickets       UUID
│ FK userId → users           UUID
│ content                    TEXT
│ type                       CommentType (PUBLIC|INTERNAL)
│ createdAt                  DateTime
│ updatedAt                  DateTime
│ INDEXES: (ticketId), (createdAt)
│ 1──< attachments (commentId)
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ attachments
│ PK id (UUID)
│ FK ticketId → tickets       UUID
│ FK commentId → comments     UUID? (nullable — untuk file yang di-upload di comment)
│ FK userId → users           UUID
│ originalName               VARCHAR
│ mimeType                   VARCHAR
│ size                       Int
│ path                       VARCHAR
│ visibility                 AttachmentVisibility (PUBLIC|INTERNAL)
│ createdAt                  DateTime
│ INDEXES: (ticketId), (commentId)
│ NOTE: EndUser responses exclude INTERNAL attachments and attachments from INTERNAL comments
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ sla_configs
│ PK id (UUID)
│ FK categoryId → categories  UUID
│ priority                   Priority (Low|Medium|High|Critical)
│ responseTimeMinutes        Int
│ resolutionTimeMinutes      Int
│ isActive                   Boolean
│ createdAt                  DateTime
│ updatedAt                  DateTime
│ UNIQUE: (categoryId, priority)
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ ticket_history
│ PK id (UUID)
│ FK ticketId → tickets       UUID
│ FK userId → users           UUID
│ field                      VARCHAR
│ oldValue                   VARCHAR? (nullable)
│ newValue                   VARCHAR? (nullable)
│ createdAt                  DateTime
│ INDEXES: (ticketId), (createdAt), (userId)
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ notifications
│ PK id (UUID)
│ FK userId → users           UUID
│ title                      VARCHAR
│ message                    TEXT
│ data                       JSON? (nullable)
│ isRead                     Boolean  (default: false)
│ createdAt                  DateTime
│ INDEXES: (userId, isRead), (createdAt)
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ telegram_config
│ PK id (UUID)
│ key (UNIQUE)               VARCHAR   @default("default") — singleton
│ botToken                   VARCHAR? (nullable — fallback from .env)
│ settings                   JSON    (enabledEvents[], enableGroupChat,
│                                     groupChatId?, templates{})
│ createdAt                  DateTime
│ updatedAt                  DateTime
│ NOTE: Singleton enforced by unique key; repository uses atomic upsert.
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Folder Structure

```
it-support-ticketing/
├── docker-compose.yml
├── docker-compose.prod.yml     # Production override: mkcert TLS (port 443)
├── scripts/
│   └── backup.sh              # PostgreSQL + uploads volume backup
├── nginx/
│   ├── nginx.conf              # Dev: HTTP-only (port 80)
│   ├── nginx.ssl.conf          # Prod: HTTPS (80→301 redirect + 443 SSL)
│   └── certs/               # mkcert SSL cert & key (gitignored)
├── backend/
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   ├── .dockerignore
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       ├── prisma/
│       │   ├── prisma.module.ts
│       │   └── prisma.service.ts
│       ├── redis/
│       │   ├── redis.module.ts
│       │   └── redis.service.ts
│       ├── common/
│       │   ├── decorators/
│       │   │   ├── current-user.decorator.ts
│       │   │   └── roles.decorator.ts
│       │   ├── filters/
│       │   │   └── http-exception.filter.ts
│       │   ├── guards/
│       │   │   ├── jwt-auth.guard.ts
│       │   │   └── roles.guard.ts
│       │   ├── interceptors/
│       │   │   └── transform.interceptor.ts
│       │   ├── interfaces/
│       │   │   └── storage-service.interface.ts
│       │   ├── policies/
│       │   │   └── attachment-visibility.policy.ts
│       │   ├── utils/
│       │   │   ├── mime-validation.util.ts
│       │   │   └── upload.util.ts
│       │   └── repositories/
│       │       ├── repositories.module.ts
│       │       ├── user.repository.ts
│       │       ├── ticket.repository.ts
│       │       ├── comment.repository.ts
│       │       ├── attachment.repository.ts
│       │       ├── category.repository.ts
│       │       ├── sub-category.repository.ts
│       │       ├── sla-config.repository.ts
│       │       ├── notification.repository.ts
│       │       └── telegram-config.repository.ts
│       ├── auth/
│       │   ├── auth.module.ts
│       │   ├── auth.controller.ts
│       │   ├── auth.service.ts
│       │   ├── dto/
│       │   │   ├── login.dto.ts
│       │   │   ├── refresh.dto.ts
│       │   │   └── change-password.dto.ts
│       │   └── strategies/
│       │       └── jwt.strategy.ts
│       ├── users/
│       │   ├── users.module.ts
│       │   ├── users.controller.ts
│       │   ├── users.service.ts
│       │   └── dto/
│       ├── tickets/
│       │   ├── tickets.module.ts
│       │   ├── tickets.controller.ts
│       │   ├── tickets.service.ts
│       │   └── dto/
│       │       ├── create-ticket.dto.ts
│       │       ├── query-ticket.dto.ts
│       │       ├── update-status.dto.ts
│       │       ├── assign-ticket.dto.ts
│       │       └── update-priority.dto.ts
│       ├── comments/
│       │   ├── comments.module.ts
│       │   ├── comments.controller.ts
│       │   ├── comments.service.ts
│       │   └── dto/
│       ├── attachments/
│       │   ├── attachments.module.ts
│       │   ├── attachments.controller.ts
│       │   ├── attachments.service.ts
│       │   └── dto/
│       ├── categories/
│       │   ├── categories.module.ts
│       │   ├── categories.controller.ts
│       │   ├── categories.service.ts
│       │   └── dto/
│       ├── sub-categories/
│       │   ├── sub-categories.module.ts
│       │   ├── sub-categories.controller.ts
│       │   ├── sub-categories.service.ts
│       │   └── dto/
│       ├── sla/
│       │   ├── sla.module.ts
│       │   ├── sla.controller.ts
│       │   ├── sla.service.ts
│       │   └── dto/
│       │       ├── create-sla-config.dto.ts
│       │       └── update-sla-config.dto.ts
│       ├── notifications/
│       │   ├── notifications.module.ts
│       │   ├── notifications.controller.ts
│       │   ├── notifications.gateway.ts
│       │   └── notifications.service.ts
│       ├── telegram/
│       │   ├── telegram.module.ts
│       │   ├── telegram.controller.ts
│       │   ├── telegram.service.ts
│       │   └── telegram.listener.ts
│       ├── maintenance/
│       │   ├── maintenance.module.ts
│       │   ├── maintenance.controller.ts
│       │   └── maintenance.service.ts
│       ├── dashboard/
│       │   ├── dashboard.module.ts
│       │   ├── dashboard.controller.ts
│       │   └── dashboard.service.ts
│       └── health/
│           ├── health.module.ts
│           └── health.controller.ts
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── .dockerignore
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── lib/
│       │   ├── axios.ts
│       │   ├── constants.ts
│       │   └── utils.ts
│       ├── types/
│       │   └── index.ts
│       ├── stores/
│       │   ├── auth-store.ts
│       │   ├── notification-store.ts
│       │   └── theme-store.ts
│       ├── hooks/
│       │   ├── use-auth.ts
│       │   ├── use-tickets.ts
│       │   ├── use-categories.ts
│       │   ├── use-users.ts
│       │   ├── use-dashboard.ts
│       │   ├── use-notifications.ts
│       │   ├── use-telegram.ts
│       │   ├── use-maintenance.ts
│       │   ├── use-change-password.ts
│       │   └── use-socket.ts
│       ├── auth/
│       │   ├── LoginForm.tsx
│       │   └── ProtectedRoute.tsx
│       ├── layout/
│       │   ├── Layout.tsx
│       │   ├── Sidebar.tsx
│       │   └── Navbar.tsx
│       ├── components/
│       │   ├── MaintenanceBanner.tsx
│       │   ├── tickets/
│       │   │   ├── TicketList.tsx
│       │   │   ├── TicketDetail.tsx
│       │   │   ├── CreateTicketForm.tsx
│       │   │   ├── CommentSection.tsx
│       │   │   ├── AttachmentList.tsx
│       │   │   ├── TicketFilters.tsx
│       │   │   ├── StatusBadge.tsx
│       │   │   └── PriorityBadge.tsx
│       │   ├── dashboard/
│       │   │   └── DashboardStats.tsx
│       │   ├── admin/
│       │   │   ├── UserManagement.tsx
│       │   │   └── MasterDataManagement.tsx
│       │   └── ui/
│       │       ├── Modal.tsx
│       │       ├── Pagination.tsx
│       │       ├── LoadingSpinner.tsx
│       │       ├── EmptyState.tsx
│       │       ├── ErrorMessage.tsx
│       │       ├── ErrorBoundary.tsx
│       │       ├── ConfirmDialog.tsx
│       │   └── PasswordInput.tsx
│       └── pages/
│           ├── LoginPage.tsx
│           ├── TicketsPage.tsx
│           ├── CreateTicketPage.tsx
│           ├── TicketDetailPage.tsx
│           ├── DashboardPage.tsx
│           ├── NotificationsPage.tsx
│           ├── MyAccountPage.tsx
│           ├── AdminUsersPage.tsx
│           ├── AdminMasterDataPage.tsx
│           └── AdminMaintenancePage.tsx
└── uploads/ (mounted volume)
```

---

## 5. Build & Deployment Notes

### Base Image Choice
- **Production runtime**: `node:20-bookworm-slim` (Debian 12) — required for native Prisma engine binary compatibility with OpenSSL 3.x.
- Alpine images are not used because newer Alpine versions (≥3.19) dropped OpenSSL 1.1 compat packages, which Prisma engines (compiled against `libssl.so.1.1`) depend on.

### Database Migration
- The container's entry point (`docker-entrypoint.sh`) runs `npx --no-install prisma migrate deploy` with a 3-retry loop (10s delay between attempts, 30s sleep before final exit) before starting the app.
  - `migrate deploy` applies pending migrations (versioned, rollbackable). Safer than `db push` for production — no accidental data loss.
  - `--no-install` ensures the CLI is not downloaded at runtime; `prisma` is a runtime dependency in `package.json`.
  - The retry loop prevents tight restart loops on transient DB failures (e.g., DB not yet ready on first boot).
  - **Initial migration** `20260623000000_init` was generated via `prisma migrate diff --from-empty --to-schema-datamodel` and marked as applied with `prisma migrate resolve --applied`.
- All migration files are stored in `prisma/migrations/` and tracked in version control.
- Follow-up migration `20260624000000_add_missing_indexes` adds indexes declared in schema but missing from the initial migration: `users(role, isActive)` and `ticket_history(userId)`.
- Migration `20260626000000_add_telegram_config_singleton_key` deduplicates `telegram_config` rows before creating the unique index on `key`, preventing failure if pre-singleton `findOrCreate()` races left multiple rows.
- To create new migrations during development: `npx prisma migrate dev --name <description>`.
- **Env validation**: `bootstrap()` calls `validateEnv()` which throws if `JWT_SECRET`, `DATABASE_URL`, or `REDIS_URL` is not set, preventing the app from starting with missing configuration. `NODE_ENV` comparison is case-insensitive (`toLowerCase()`).

### Database Seeding
- `prisma/seed.ts` is compiled to `dist/prisma/seed.js` during the Docker multi-stage build (`npx tsc prisma/seed.ts --outDir dist/prisma`).
- The entry point (`docker-entrypoint.sh`) runs seed automatically in non-production mode after migrations. In production, seed runs only when `SEED_ON_START=true` is set.
- Default Admin/ITSupport users are created only if missing; existing user passwords are not reset by seed (dev mode). In production, passwords are rotated on each seed via `upsert`.
- The sample ticket is skipped when `NODE_ENV=production`.
- **Production seed**: requires `SEED_ADMIN_PASSWORD` and `SEED_SUPPORT_PASSWORD` environment variables. If either is missing, seed throws an error with an explicit message. Production credentials are never logged to stdout.

### Backup Operations
- `scripts/backup.sh` creates a timestamped backup under `backups/` while Compose services are running.
- `backup.sh` reads environment variables from `backend/.env` (canonical source for the API service). The `POSTGRES_PASSWORD` in `backend/.env` must match `backend/.env.db` so the script can authenticate to the `db` container.
- The database backup uses `docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip`.
- The upload backup uses `docker compose run --rm --no-deps api tar -czf ... -C /app/uploads .`, so Compose resolves the `uploads_data` named volume instead of relying on host paths.
- Backup output contains `db.sql.gz`, `uploads.tar.gz`, and `manifest.txt`; `backups/` is gitignored and should be copied off-host for production retention.
- `db.sql.gz` contains the full `public` schema: users, tickets, comments, attachments, categories, sub_categories, sla_configs, ticket_history, notifications, and telegram_config. Redis is not backed up — refresh tokens, cache, and maintenance flags are lost after restore.
- Admin UI backup uses `/api/maintenance/backups`, runs inside the API container, and writes to the same `./backups:/app/backups` mount.
- Admin UI backup uses `postgresql-client-16` to match PostgreSQL 16, parses `DATABASE_URL` into libpq env vars for `pg_dump`, preserves `schema` as `--schema`, and compresses the dump only after `pg_dump` succeeds.
- Admin UI backup exposes separate downloads: `DB` for `db.sql.gz` (PostgreSQL logical dump) and `Uploads` for `uploads.tar.gz` (attachment files). `DELETE /api/maintenance/backups/:id` removes the whole timestamped backup folder.
- Admin UI restore uses `POST /api/maintenance/backups/:id/restore` for full DB + uploads restore. It requires typed backup ID confirmation, validates both gzip files, validates upload archive entries against path traversal/symlink/hardlink abuse, creates a pre-restore backup automatically, restores DB via `psql`, restores uploads through a temporary directory swap (tempDir created inside `uploadDir` to avoid `EXDEV` cross-device rename), then requires the user to log in again.
- Restore flow: enable maintenance mode → 5-second drain time → create pre-restore backup → DROP SCHEMA + import SQL + extract uploads → disable maintenance mode (only on success). `MaintenanceGuard` allows Admin through during maintenance via JWT verification while non-admin API calls return `503`. Total maintenance duration is typically 15-60 seconds depending on DB/upload size. If restore fails, maintenance mode remains active and the original error is logged via `Logger`.
- Admin must enable maintenance mode from the UI before backup/restore buttons become active.
- Restore is destructive and should be run during a maintenance window.

### Production Deployment
> For a step-by-step production setup guide (env config, TLS options with mkcert, build/start, verify), see [README.md §Production Deployment](./README.md#production-deployment). This section covers runtime characteristics only.

- All services have `restart: unless-stopped` — containers auto-restart on crash.
- Backend production image installs dependencies with `npm ci --omit=dev`; `docker-entrypoint.sh` chowns `/app/uploads` and `/app/backups`, then uses `gosu` so the app still runs as the non-root `node` user.
- Compose binds the API debug port to `127.0.0.1:3000`; normal browser traffic enters through Nginx `/api/`, so Nginx rate limiting and upload body limits are not bypassed remotely.
- Nginx sets `client_max_body_size 20m`, accommodating the backend upload limits (10MB direct attachment, 5MB comment attachment).
- API healthcheck: `"CMD", "wget", "--spider", "-q", "http://localhost:3000/health"` — interval 30s, start_period 30s, 3 retries. Container is killed + restarted after 3 consecutive failures. Health endpoint returns HTTP 503 (not 200) when DB or Redis is unhealthy, so the healthcheck correctly detects outages.
- Security headers via `helmet` middleware (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, etc.) applied at NestJS application layer.
- Request logging via `morgan('combined')` — each HTTP request logged to stdout (captured by Docker logs).
- CORS locked down to explicit origins via `CORS_ORIGIN` env var.
- Redis requires `REDIS_PASSWORD` in production; Compose `cache` reads `backend/.env.cache` (least-privilege, SEC-023) and starts Redis with `requirepass`. Redis is configured with `maxmemory 400mb`, `maxmemory-policy allkeys-lru`, and `stop-writes-on-bgsave-error no` (Redis has no persistence volume, so RDB saves always fail; without this flag, Redis would block all writes including login account lock checks).
- Global exception filter (`HttpExceptionFilter`) ensures consistent `{ error: { code, message } }` response format for all errors and returns a generic message for unexpected 500 errors.
- Prisma connection pool configured via `DATABASE_POOL_MAX` env (default 10, recommended 20 for production), set via `connection_limit` query parameter in the connection string.
- PostgreSQL is tuned via a custom `postgres/postgresql.conf` mounted into the db container: `listen_addresses='*'`, `shared_buffers=512MB`, `work_mem=16MB`, `effective_cache_size=1536MB`. `listen_addresses='*'` is required so PostgreSQL binds to the Docker network interface instead of only localhost. The db container uses `shm_size: 1g` (vs Docker default 64MB) to support parallel query execution and large hash aggregates.
- nginx access logging is buffered (`buffer=16k flush=2m`) to reduce per-request I/O syscalls through the Docker json-file log driver.
- Logging: `json-file` driver with `max-size: 10m` and `max-file: 3` — prevents disk exhaustion from unbounded logs.

### Security Rules
- Access tokens are short-lived JWTs stored only in frontend memory; refresh tokens are httpOnly cookies backed by Redis and revoked on logout. Refresh token rotation uses atomic Lua GETDEL to prevent replay attacks from concurrent refresh calls.
- Inactive users are rejected during login, refresh, JWT validation, and WebSocket connection validation. WebSocket sessions are also bounded to access-token expiry: `NotificationsGateway` reads `payload.exp` and schedules a `setTimeout` disconnect at expiry; already-expired tokens disconnect immediately. Timers are cleared on disconnect/deactivation.
- EndUser access is ownership-scoped: EndUser can create tickets as requester, can only view/comment/upload/list/download attachments for own tickets, and can only close own resolved tickets.
- EndUser cannot access `/dashboard` or admin routes; both backend roles and frontend routes/actions enforce this.
- INTERNAL comments, INTERNAL standalone attachments, and attachments attached to INTERNAL comments are hidden from EndUser ticket detail/list/download responses. Visibility is centralized via `AttachmentVisibilityPolicy` in `backend/src/common/policies/`.
- EndUser ticket `_count` reflects only visible comments/attachments (public + direct), not internal counts.
- File upload validation runs at the Multer interceptor layer (`limits` + MIME `fileFilter`) and again in service-level magic-byte checks before persistence.
- Upload filenames are generated server-side (`uuid + safe extension`); `originalName` stored in DB for display only. `LocalStorageService` validates path containment as defense-in-depth.
- CSV export escapes every field and neutralizes formula injection prefixes before download.
- `MaintenanceGuard` (global `APP_GUARD`) blocks non-essential API requests when maintenance mode is enabled. Allowed paths (`/health`, `/maintenance/*`, `/auth/*`) are checked BEFORE Redis access, so Redis outages do not block essential endpoints. If Redis is unreachable, the guard defaults to "allow" (fail-open) to prevent total system lockout. When maintenance is enabled, the guard verifies the JWT from `Authorization` header: Admin → allow through; non-admin → `503 { error: { code: 'MAINTENANCE', message } }`; expired/invalid token → allow (let `JwtAuthGuard` handle 401 → frontend refresh); no token → 503.
- `TransformInterceptor` (global `APP_INTERCEPTOR`) wraps all success responses in `{ data, meta? }` envelope. Skips wrap for stream/CSV/blob responses. Frontend uses `unwrapData<T>()` and `unwrapPage<T>()` helpers to extract data from the envelope.
- `HttpExceptionFilter` returns stable error codes (`BAD_REQUEST`, `NOT_FOUND`, `MAINTENANCE`, etc.) via `resp.code` or `getCodeFromStatus()` fallback.
- Dashboard stats are cached in Redis (`dashboard:stats:v1`, 30s TTL). `DashboardService` listens to `ticket.created`, `ticket.status.updated`, `ticket.assigned`, `ticket.priority.updated`, and `ticket.deleted` events via `EventEmitter2` and invalidates the cache so stats stay fresh without waiting for the TTL.
- Maintenance mode flag stored in Redis (`maintenance:enabled`, `maintenance:message`) — not in DB, so it survives DB restore but not Redis flush.
- Health endpoint always accessible (no auth required) and includes `maintenance: { enabled, message }` in its response for frontend polling.
- Restore does not disable maintenance mode on failure — maintenance stays active until restore completes successfully. The original error is logged via `Logger` so "See server logs for details" in the error message is actionable.
- Telegram config API response strips `groupChatId`; only `hasBotToken`/`hasGroupChatId` flags returned to frontend.

### Built Artifacts
- NestJS compiles TypeScript into `/app/dist/src/` (not `/app/dist/`), so the entry point is `node dist/src/main`.
- React frontend is built via a separate `frontend` Docker service using `target: builder` stage from `frontend/Dockerfile`. Build pipeline:
  1. `npm ci` installs all dependencies (including devDependencies — Tailwind, PostCSS, TypeScript).
  2. `npm run build` executes `tsc && vite build`.
  3. Vite processes PostCSS plugins (`tailwindcss`, `autoprefixer`), resolves `@/` path aliases, and outputs to `/app/dist/`.
  4. At container runtime, the `frontend` service copies `/app/dist/*` to the `frontend_dist` named volume.
  5. The `nginx` service mounts the same volume at `/usr/share/nginx/html` and serves the SPA.
- `postcss.config.js` and `tailwind.config.js` **must** be copied into the image — the Vite build silently skips PostCSS/Tailwind processing if they are absent, producing raw `@tailwind`/`@apply` directives that browsers cannot interpret.
- The `production` stage of the Dockerfile is retained for standalone use (e.g., CI/CD pipelines where the frontend image serves itself via nginx).

---

## 6. Scaling Suggestions

### To Kubernetes / Cloud-Native

1. **Stateless API** — The NestJS API is already stateless (JWT + Redis). Add liveness (`GET /api/health`) and readiness probes, configure HorizontalPodAutoscaler (HPA) based on CPU/memory metrics.

2. **File Upload** — Replace `LocalStorageService` with an S3/GCS implementation behind the existing `StorageService` interface. Use presigned URLs for direct client-to-storage upload, bypassing the API server entirely.

3. **Cron Job** — The SLA breach check uses a Redis lock to prevent duplicate execution and processes tickets in batches of 500 to avoid memory exhaustion with 10,000+ active tickets. In Kubernetes, extract this into a separate `CronJob` resource with a dedicated container running the check on schedule, rather than relying on the in-process `@Cron` decorator.

4. **Database** — Switch to managed PostgreSQL (AWS RDS / GCP Cloud SQL) with read replicas for reporting queries. Prisma supports connection pooling via PgBouncer, which should be deployed as a sidecar or connection pooler.

5. **Redis** — Use managed Redis (AWS ElastiCache / GCP Memorystore). Separate Redis instances for tokens vs. cache to avoid eviction of session data.

6. **Session Affinity** — Not required. JWT access tokens are in-memory (not persisted to localStorage); refresh tokens are httpOnly cookies sent with every `/api/auth/refresh` request.

7. **Static Assets** — Serve the React frontend build from a CDN (CloudFront / Cloudflare), not from Nginx. The Nginx container becomes unnecessary in this setup; the API can be exposed via an Ingress controller directly.

8. **CI/CD** — Use GitHub Actions pipeline: lint → test → build (Docker images) → push to container registry → deploy to Kubernetes via Helm or Kustomize. Use separate namespaces for staging and production.

## 7. Security Architecture

### Authentication & Authorization
- **JWT tokens**: access (15min, `tokenType: 'access'`) + refresh (7d, `tokenType: 'refresh'`, httpOnly cookie). Both signed with `JWT_SECRET`. `tokenType` is required in payload — tokens without it are rejected.
- **Global auth guard**: `JwtAuthGuard` registered as `APP_GUARD` in `app.module.ts`. Fail-closed: any controller without `@Public()` requires authentication. `@Public()` applied to `HealthController`, `AuthController` (login/refresh/logout), `MaintenanceController.getMode()`.
- **Role-based access**: `RolesGuard` checks `@Roles(...)` metadata. EndUser restricted from dashboard, users, master data, maintenance.
- **Account lockout**: 10 failed login attempts → 15-minute Redis lock (`login:locked:{email}`). Prevents distributed brute-force.
- **Timing attack mitigation**: `validateUser()` performs dummy bcrypt compare for non-existent users to equalize response time.
- **Refresh token rotation**: old jti deleted on rotation; reuse detection revokes token. Stored in Redis with TTL matching JWT expiry.

### File Upload Security
- **Extension whitelist**: `upload.util.ts` — only `.jpg`, `.png`, `.pdf`, `.docx`, etc. Non-whitelisted extensions stripped.
- **Magic byte verification**: `mime-validation.util.ts` — 8 signatures (JPEG, PNG, GIF, WebP, PDF, ZIP, RAR, OLE2/DOC). Text files checked for null bytes. A `MIME_COMPATIBILITY_MAP` allows compatible container mismatches: OOXML files (`.docx`/`.xlsx`) are ZIP containers detected as `application/zip`, and legacy `.xls` shares the OLE2 CFB signature with `application/msword`. Obvious spoofing (e.g., ZIP declared as `image/png`) is still rejected. Shared across comments and attachments modules.
- **Path traversal prevention**: `path.basename()` + `resolvedPath.startsWith(uploadRoot)` double check.
- **`originalName` sanitization**: `path.basename()` + `substring(0, 255)` before DB storage.
- **`path` field exclusion**: `ATTACHMENT_SAFE_SELECT` and comment repository `select` — filesystem path never exposed to clients.
- **DTO input validation**: `CreateTicketDto` and `CreateCommentDto` use `@Transform(trimString)` + `@IsNotEmpty()` + `@MinLength()` so direct API clients cannot submit whitespace-only or too-short text payloads. `ValidationPipe` is enabled globally with `whitelist` and `forbidNonWhitelisted`.

### Infrastructure Security
- **Docker hardening**: `no-new-privileges`, `cap_drop: ALL` with minimal `cap_add`, `mem_limit`, `cpus`, `pids_limit` on all services.
- **Least-privilege env**: `backend/.env.db` (DB only), `backend/.env.cache` (Redis only), `backend/.env` (API full set).
- **Nginx**: CSP, security headers repeated per location block (add_header inheritance), `default_server` for unmatched Host, dotfile deny.
- **Secret hygiene**: `.env` permission `600`, `.gitignore` covers `.env.*`, strong credentials via `openssl rand`.
- **CI/CD**: GitHub Actions runs build + test on every PR.
