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
  ┌──────────┐     ┌─────────────────────┐    ┌──────────────────┐
  │ Browser  │────▶│  Nginx (:80)        │◀───│ /usr/share/      │
  │          │     │  reverse proxy      │    │ nginx/html       │
  └──────────┘     └───────┬─────────────┘    └──────────────────┘
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
| Reverse Proxy | Nginx | Single entry point, rate limiting, static file serving. |
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
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ attachments
│ PK id (UUID)
│ FK ticketId → tickets       UUID
│ FK userId → users           UUID
│ originalName               VARCHAR
│ mimeType                   VARCHAR
│ size                       Int
│ path                       VARCHAR
│ createdAt                  DateTime
│ INDEXES: (ticketId)
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
```

---

## 3. Folder Structure

```
it-support-ticketing/
├── docker-compose.yml
├── .env.example
├── nginx/
│   └── nginx.conf
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
│       │   ├── auth.dto.ts
│       │   └── strategies/
│       │       ├── jwt.strategy.ts
│       │       └── jwt-refresh.strategy.ts
│       ├── users/
│       │   ├── users.module.ts
│       │   ├── users.controller.ts
│       │   ├── users.service.ts
│       │   └── users.dto.ts
│       ├── tickets/
│       │   ├── tickets.module.ts
│       │   ├── tickets.controller.ts
│       │   ├── tickets.service.ts
│       │   └── tickets.dto.ts
│       ├── comments/
│       │   ├── comments.module.ts
│       │   ├── comments.controller.ts
│       │   ├── comments.service.ts
│       │   └── comments.dto.ts
│       ├── attachments/
│       │   ├── attachments.module.ts
│       │   ├── attachments.controller.ts
│       │   ├── attachments.service.ts
│       │   └── attachments.dto.ts
│       ├── categories/
│       │   ├── categories.module.ts
│       │   ├── categories.controller.ts
│       │   ├── categories.service.ts
│       │   └── categories.dto.ts
│       ├── sub-categories/
│       │   ├── sub-categories.module.ts
│       │   ├── sub-categories.controller.ts
│       │   ├── sub-categories.service.ts
│       │   └── sub-categories.dto.ts
│       ├── sla/
│       │   ├── sla.module.ts
│       │   ├── sla.controller.ts
│       │   ├── sla.service.ts
│       │   └── sla.dto.ts
│       ├── notifications/
│       │   ├── notifications.module.ts
│       │   ├── notifications.controller.ts
│       │   ├── notifications.service.ts
│       │   └── notifications.dto.ts
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
│       │       └── PasswordInput.tsx
│       └── pages/
│           ├── LoginPage.tsx
│           ├── TicketsPage.tsx
│           ├── CreateTicketPage.tsx
│           ├── TicketDetailPage.tsx
│           ├── DashboardPage.tsx
│           ├── NotificationsPage.tsx
│           ├── ChangePasswordPage.tsx
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
- The container's entry point (`CMD`) runs `npx prisma db push && node dist/prisma/seed.js && node dist/src/main`.
  - `db push` ensures the database schema matches the Prisma schema.
  - `seed.js` populates initial users, categories, SLA configs, and a sample ticket.
- `prisma migrate deploy` was avoided because the project does not maintain migration files in version control. Use `prisma migrate dev` in development to generate migration files once the schema stabilizes.

### Database Seeding
- `prisma/seed.ts` is compiled to `dist/prisma/seed.js` during the Docker multi-stage build (`npx tsc prisma/seed.ts --outDir dist/prisma`).
- The compiled JS runs directly with `node` in production — no `ts-node` dependency needed at runtime.
- Uses `prisma.user.upsert` with `update: { password }` so credentials are refreshed on every container restart.

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

3. **Cron Job** — The SLA breach check uses a Redis lock to prevent duplicate execution. In Kubernetes, extract this into a separate `CronJob` resource with a dedicated container running the check on schedule, rather than relying on the in-process `@Cron` decorator.

4. **Database** — Switch to managed PostgreSQL (AWS RDS / GCP Cloud SQL) with read replicas for reporting queries. Prisma supports connection pooling via PgBouncer, which should be deployed as a sidecar or connection pooler.

5. **Redis** — Use managed Redis (AWS ElastiCache / GCP Memorystore). Separate Redis instances for tokens vs. cache to avoid eviction of session data.

6. **Session Affinity** — Not required. JWT tokens in `Authorization` header make every request stateless.

7. **Static Assets** — Serve the React frontend build from a CDN (CloudFront / Cloudflare), not from Nginx. The Nginx container becomes unnecessary in this setup; the API can be exposed via an Ingress controller directly.

8. **CI/CD** — Use GitHub Actions pipeline: lint → test → build (Docker images) → push to container registry → deploy to Kubernetes via Helm or Kustomize. Use separate namespaces for staging and production.
