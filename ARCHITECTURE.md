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
   ┌──────────┐     ┌─────────────────────────┐    ┌──────────────────┐
   │ Browser  │────▶│  Nginx (:80 → 301, :443)│◀───│ /usr/share/      │
   │          │     │  reverse proxy + SSL    │    │ nginx/html       │
   └──────────┘     └────────────┬────────────┘    └──────────────────┘
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
| Reverse Proxy | Nginx | Single entry point, rate limiting, static file serving, SSL termination with mkcert (self-signed CA). HTTP → HTTPS redirect on port 443. |
| Containerization | Docker (Debian bookworm-slim) | Reproducible deployment, identical dev/prod environment. Debian base chosen over Alpine for native OpenSSL 3.x compatibility with Prisma engines. |
| ORM | Prisma | Type-safe query builder, auto-generated types, migrations. |

---

## 2. Database Schema (ERD Textual)

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
│ INDEXES: (email), (role)
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
│ INDEXES: (ticketId), (createdAt)
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
├── nginx/
│   ├── nginx.conf
│   └── certs/               # mkcert SSL cert & key (gitignored)
├── backend/
│   ├── Dockerfile
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
│       │   └── pipes/
│       │       └── uuid-validation.pipe.ts
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
│       │   └── use-change-password.ts
│       ├── components/
│       │   ├── auth/
│       │   │   ├── LoginForm.tsx
│       │   │   └── ProtectedRoute.tsx
│       │   ├── layout/
│       │   │   ├── Layout.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   └── Navbar.tsx
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
│           └── AdminMasterDataPage.tsx
└── uploads/ (mounted volume)
```

---

## 4. Build & Deployment Notes

### Base Image Choice
- **Production runtime**: `node:20-bookworm-slim` (Debian 12) — required for native Prisma engine binary compatibility with OpenSSL 3.x.
- Alpine images are not used because newer Alpine versions (≥3.19) dropped OpenSSL 1.1 compat packages, which Prisma engines (compiled against `libssl.so.1.1`) depend on.

### Database Migration
- The container's entry point (`CMD`) runs `npx prisma migrate deploy && node dist/prisma/seed.js && node dist/src/main`.
  - `migrate deploy` applies pending migrations (versioned, rollbackable). Safer than `db push` for production — no accidental data loss.
  - **Initial migration** `20260623000000_init` was generated via `prisma migrate diff --from-empty --to-schema-datamodel` and marked as applied with `prisma migrate resolve --applied`.
  - `seed.js` populates initial users, categories, SLA configs, and a sample ticket.
- All migration files are stored in `prisma/migrations/` and tracked in version control.
- To create new migrations during development: `npx prisma migrate dev --name <description>`.
- **Env validation**: `bootstrap()` calls `validateEnv()` which throws if `JWT_SECRET` or `DATABASE_URL` is not set, preventing the app from starting with missing configuration.

### Database Seeding
- `prisma/seed.ts` is compiled to `dist/prisma/seed.js` during the Docker multi-stage build (`npx tsc prisma/seed.ts --outDir dist/prisma`).
- The compiled JS runs directly with `node` in production — no `ts-node` dependency needed at runtime.
- Uses `prisma.user.upsert` with `update: { password }` so credentials are refreshed on every container restart.

### Production Deployment
- All services have `restart: unless-stopped` — containers auto-restart on crash.
- API healthcheck: `"CMD", "wget", "--spider", "-q", "http://localhost:3000/health"` — interval 30s, start_period 30s, 3 retries. Container is killed + restarted after 3 consecutive failures.
- HTTPS: Nginx terminates SSL on port 443 using mkcert-generated certificates (`nginx/certs/`). Port 80 redirects to HTTPS via 301. All API and frontend traffic is encrypted.
- Logging: `json-file` driver with `max-size: 10m` and `max-file: 3` — prevents disk exhaustion from unbounded logs.

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

## 5. Scaling Suggestions

### To Kubernetes / Cloud-Native

1. **Stateless API** — The NestJS API is already stateless (JWT + Redis). Add liveness (`GET /api/health`) and readiness probes, configure HorizontalPodAutoscaler (HPA) based on CPU/memory metrics.

2. **File Upload** — Replace `LocalStorageService` with an S3/GCS implementation behind the existing `StorageService` interface. Use presigned URLs for direct client-to-storage upload, bypassing the API server entirely.

3. **Cron Job** — The SLA breach check uses a Redis lock to prevent duplicate execution and processes tickets in batches of 500 to avoid memory exhaustion with 10,000+ active tickets. In Kubernetes, extract this into a separate `CronJob` resource with a dedicated container running the check on schedule, rather than relying on the in-process `@Cron` decorator.

4. **Database** — Switch to managed PostgreSQL (AWS RDS / GCP Cloud SQL) with read replicas for reporting queries. Prisma supports connection pooling via PgBouncer, which should be deployed as a sidecar or connection pooler.

5. **Redis** — Use managed Redis (AWS ElastiCache / GCP Memorystore). Separate Redis instances for tokens vs. cache to avoid eviction of session data.

6. **Session Affinity** — Not required. JWT access tokens are in-memory (not persisted to localStorage); refresh tokens are httpOnly cookies sent with every `/api/auth/refresh` request.

7. **Static Assets** — Serve the React frontend build from a CDN (CloudFront / Cloudflare), not from Nginx. The Nginx container becomes unnecessary in this setup; the API can be exposed via an Ingress controller directly.

8. **CI/CD** — Use GitHub Actions pipeline: lint → test → build (Docker images) → push to container registry → deploy to Kubernetes via Helm or Kustomize. Use separate namespaces for staging and production.
