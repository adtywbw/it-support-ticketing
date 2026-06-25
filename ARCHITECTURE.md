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
| Cache | Redis 7 | Refresh token store, cron job lock for horizontal scaling. |
| Reverse Proxy | Nginx | Single entry point, rate limiting, static file serving, reverse proxy. |
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

The `MaintenanceModule` is intentionally operational rather than domain-persistent: it uses filesystem access and OS tools (`pg_dump`, `gzip`, `tar`) to create, download, and delete backups under `/app/backups`, and is restricted to Admin users. It also manages a maintenance mode flag stored in Redis that blocks non-admin/non-auth API requests via `MaintenanceGuard`.

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
│ createdAt                  DateTime
│ INDEXES: (ticketId), (commentId)
│ NOTE: EndUser responses exclude attachments from INTERNAL comments
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
│ botToken                   VARCHAR? (nullable — fallback from .env)
│ settings                   JSON    (enabledEvents[], enableGroupChat,
│                                     groupChatId?, templates{})
│ createdAt                  DateTime
│ updatedAt                  DateTime
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Folder Structure

```
it-support-ticketing/
├── docker-compose.yml
├── .env.example
├── scripts/
│   └── backup.sh              # PostgreSQL + uploads volume backup
├── nginx/
│   ├── nginx.conf
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
│       │   │   └── response-envelope.interceptor.ts
│       │   ├── interfaces/
│       │   │   └── storage-service.interface.ts
│       │   ├── pipes/
│       │   │   └── uuid-validation.pipe.ts
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
│       │   └── use-change-password.ts
│       ├── auth/
│       │   ├── LoginForm.tsx
│       │   └── ProtectedRoute.tsx
│       ├── layout/
│       │   ├── Layout.tsx
│       │   ├── Sidebar.tsx
│       │   └── Navbar.tsx
│       ├── components/
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
- The container's entry point (`CMD`) runs `npx --no-install prisma migrate deploy && node dist/src/main`.
  - `migrate deploy` applies pending migrations (versioned, rollbackable). Safer than `db push` for production — no accidental data loss.
  - `--no-install` ensures the CLI is not downloaded at runtime; `prisma` is a runtime dependency in `package.json`.
  - **Initial migration** `20260623000000_init` was generated via `prisma migrate diff --from-empty --to-schema-datamodel` and marked as applied with `prisma migrate resolve --applied`.
- All migration files are stored in `prisma/migrations/` and tracked in version control.
- Follow-up migration `20260624000000_add_missing_indexes` adds indexes declared in schema but missing from the initial migration: `users(role, isActive)` and `ticket_history(userId)`.
- To create new migrations during development: `npx prisma migrate dev --name <description>`.
- **Env validation**: `bootstrap()` calls `validateEnv()` which throws if `JWT_SECRET`, `DATABASE_URL`, or `REDIS_URL` is not set, preventing the app from starting with missing configuration.

### Database Seeding
- `prisma/seed.ts` is compiled to `dist/prisma/seed.js` during the Docker multi-stage build (`npx tsc prisma/seed.ts --outDir dist/prisma`).
- Production containers do not run seed automatically. Run seed manually only when intentionally provisioning dev/demo data.
- Default Admin/ITSupport users are created only if missing; existing user passwords are not reset by seed.
- The sample ticket is skipped when `NODE_ENV=production`.
- **Production seed**: requires `SEED_ADMIN_PASSWORD` and `SEED_SUPPORT_PASSWORD` environment variables. If either is missing, seed throws an error with an explicit message. Production credentials are never logged to stdout.

### Backup Operations
- `scripts/backup.sh` creates a timestamped backup under `backups/` while Compose services are running.
- `backup.sh` reads environment variables from `backend/.env` (canonical source), matching the API and DB services.
- The database backup uses `docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip`.
- The upload backup uses `docker compose run --rm --no-deps api tar -czf ... -C /app/uploads .`, so Compose resolves the `uploads_data` named volume instead of relying on host paths.
- Backup output contains `db.sql.gz`, `uploads.tar.gz`, and `manifest.txt`; `backups/` is gitignored and should be copied off-host for production retention.
- `db.sql.gz` contains the full `public` schema: users, tickets, comments, attachments, categories, sub_categories, sla_configs, ticket_history, notifications, and telegram_config. Redis is not backed up — refresh tokens, cache, and maintenance flags are lost after restore.
- Admin UI backup uses `/api/maintenance/backups`, runs inside the API container, and writes to the same `./backups:/app/backups` mount.
- Admin UI backup uses `postgresql-client-16` to match PostgreSQL 16, parses `DATABASE_URL` into libpq env vars for `pg_dump`, preserves `schema` as `--schema`, and compresses the dump only after `pg_dump` succeeds.
- Admin UI backup exposes separate downloads: `DB` for `db.sql.gz` (PostgreSQL logical dump) and `Uploads` for `uploads.tar.gz` (attachment files). `DELETE /api/maintenance/backups/:id` removes the whole timestamped backup folder.
- Admin UI restore uses `POST /api/maintenance/backups/:id/restore` for full DB + uploads restore. It requires typed backup ID confirmation, validates both gzip files, creates a pre-restore backup automatically, restores DB via `psql`, restores uploads via `tar`, then requires the user to log in again.
- Restore flow: enable maintenance mode → 5-second drain time → create pre-restore backup → DROP SCHEMA + import SQL + extract uploads → disable maintenance mode (only on success). `MaintenanceGuard` blocks non-admin API requests during restore while admin can still access `/api/maintenance/*` endpoints. Total maintenance duration is typically 15-60 seconds depending on DB/upload size. If restore fails, maintenance mode remains active.
- Admin must enable maintenance mode from the UI before backup/restore buttons become active.
- Restore is destructive and should be run during a maintenance window.

### Production Deployment
- All services have `restart: unless-stopped` — containers auto-restart on crash.
- Backend production image installs dependencies with `npm ci --omit=dev`; `docker-entrypoint.sh` chowns `/app/uploads` and `/app/backups`, then uses `gosu` so the app still runs as the non-root `node` user.
- Compose binds the API debug port to `127.0.0.1:3000`; normal browser traffic enters through Nginx `/api/`, so Nginx rate limiting and upload body limits are not bypassed remotely.
- Nginx sets `client_max_body_size 10m`, matching the largest backend ticket attachment upload limit.
- API healthcheck: `"CMD", "wget", "--spider", "-q", "http://localhost:3000/health"` — interval 30s, start_period 30s, 3 retries. Container is killed + restarted after 3 consecutive failures.
- Security headers via `helmet` middleware (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, etc.) applied at NestJS application layer.
- Request logging via `morgan('combined')` — each HTTP request logged to stdout (captured by Docker logs).
- CORS locked down to explicit origins via `CORS_ORIGIN` env var.
- Global exception filter (`HttpExceptionFilter`) ensures consistent `{ error: { code, message } }` response format for all errors and returns a generic message for unexpected 500 errors.
- Prisma connection pool configured via `DATABASE_POOL_MAX` env (default 10), set via `connection_limit` query parameter in the connection string.
- Logging: `json-file` driver with `max-size: 10m` and `max-file: 3` — prevents disk exhaustion from unbounded logs.

### Security Rules
- Access tokens are short-lived JWTs stored only in frontend memory; refresh tokens are httpOnly cookies backed by Redis and revoked on logout.
- Inactive users are rejected during login, refresh, JWT validation, and WebSocket connection validation.
- EndUser access is ownership-scoped: EndUser can create tickets as requester, can only view/comment/upload/list/download attachments for own tickets, and can only close own resolved tickets.
- EndUser cannot access `/dashboard` or admin routes; both backend roles and frontend routes/actions enforce this.
- INTERNAL comments and attachments attached to INTERNAL comments are hidden from EndUser ticket detail/list/download responses.
- EndUser ticket `_count` reflects only visible comments/attachments (public + direct), not internal counts.
- File upload validation runs at the Multer interceptor layer (`limits` + MIME `fileFilter`) and again in service-level checks before persistence.
- Upload filenames are generated server-side (`uuid + safe extension`); `originalName` stored in DB for display only. `LocalStorageService` validates path containment as defense-in-depth.
- CSV export escapes every field and neutralizes formula injection prefixes before download.
- `MaintenanceGuard` (global `APP_GUARD`) blocks all non-essential API requests when maintenance mode is enabled. Allowed during maintenance: `/health`, `/maintenance/*` (all methods), `/auth/*` (all methods). Non-admin users receive `503 { error: { code: 'MAINTENANCE', message } }`.
- Maintenance mode flag stored in Redis (`maintenance:enabled`, `maintenance:message`) — not in DB, so it survives DB restore but not Redis flush.
- Health endpoint always accessible (no auth required) and includes `maintenance: { enabled, message }` in its response for frontend polling.
- Restore does not disable maintenance mode on failure — `restoreSucceeded` flag ensures maintenance stays active until restore completes successfully.
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
