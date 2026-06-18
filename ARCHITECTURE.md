# Architecture Documentation — IT Support Ticketing

## 1. Architecture Overview

### Container Diagram (text-based)

```
┌──────────────┐     ┌──────────────┐
│   Browser    │─────│   Nginx      │
│  (React SPA) │     │  :80         │
└──────────────┘     └──────┬───────┘
                            │
                    ┌───────┴───────┐
                    │   API         │
                    │  (NestJS)     │
                    │  :3000        │
                    └───┬───────┬───┘
                        │       │
              ┌─────────┴┐  ┌───┴──────────┐
              │PostgreSQL│  │  Redis 7      │
              │   16     │  │(tokens, lock) │
              └──────────┘  └──────────────┘
```

### Stack Justification

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Backend | NestJS + TypeScript | Opinionated, modular, built-in DI, guards, pipes, interceptors. Natural fit for enterprise-grade REST API. |
| Frontend | React 18 + Vite | Fast dev/build, TanStack Query for server state caching/refetching, Zustand for minimal client state. |
| Database | PostgreSQL 16 | Mature, JSON support, excellent Prisma integration. |
| Cache | Redis 7 | Refresh token store, cron job lock for horizontal scaling. |
| Reverse Proxy | Nginx | Single entry point, rate limiting, static file serving. |
| Containerization | Docker | Reproducible deployment, identical dev/prod environment. |
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
│ ticketNumber (UNIQUE)      VARCHAR   TKT-YYYYMM-XXXXXX
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
│       │   ├── api.ts
│       │   └── query-client.ts
│       ├── types/
│       │   └── index.ts
│       ├── stores/
│       │   ├── auth.store.ts
│       │   └── notification.store.ts
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   ├── useTickets.ts
│       │   ├── useComments.ts
│       │   ├── useNotifications.ts
│       │   └── useDashboard.ts
│       ├── components/
│       │   ├── auth/
│       │   │   ├── LoginForm.tsx
│       │   │   └── ProtectedRoute.tsx
│       │   ├── layout/
│       │   │   ├── AppLayout.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   ├── Header.tsx
│       │   │   └── NotificationBell.tsx
│       │   ├── tickets/
│       │   │   ├── TicketList.tsx
│       │   │   ├── TicketCard.tsx
│       │   │   ├── TicketDetail.tsx
│       │   │   ├── CreateTicketForm.tsx
│       │   │   ├── CommentThread.tsx
│       │   │   └── TicketFilters.tsx
│       │   ├── dashboard/
│       │   │   ├── StatusPieChart.tsx
│       │   │   ├── PriorityBarChart.tsx
│       │   │   ├── TicketTrendChart.tsx
│       │   │   ├── SLAComplianceCard.tsx
│       │   │   └── AvgResolutionTimeCard.tsx
│       │   ├── admin/
│       │   │   ├── UserManagement.tsx
│       │   │   ├── MasterDataManagement.tsx
│       │   │   └── SLAConfigForm.tsx
│       │   └── ui/
│       │       ├── Button.tsx
│       │       ├── Input.tsx
│       │       ├── Select.tsx
│       │       ├── Badge.tsx
│       │       ├── Modal.tsx
│       │       ├── Pagination.tsx
│       │       ├── Spinner.tsx
│       │       └── EmptyState.tsx
│       └── pages/
│           ├── LoginPage.tsx
│           ├── TicketListPage.tsx
│           ├── CreateTicketPage.tsx
│           ├── TicketDetailPage.tsx
│           ├── DashboardPage.tsx
│           ├── AdminUsersPage.tsx
│           └── AdminMasterDataPage.tsx
└── uploads/ (mounted volume)
```

---

## 4. Scaling Suggestions

### To Kubernetes / Cloud-Native

1. **Stateless API** — The NestJS API is already stateless (JWT + Redis). Add liveness (`GET /api/health`) and readiness probes, configure HorizontalPodAutoscaler (HPA) based on CPU/memory metrics.

2. **File Upload** — Replace `LocalStorageService` with an S3/GCS implementation behind the existing `StorageService` interface. Use presigned URLs for direct client-to-storage upload, bypassing the API server entirely.

3. **Cron Job** — The SLA breach check uses a Redis lock to prevent duplicate execution. In Kubernetes, extract this into a separate `CronJob` resource with a dedicated container running the check on schedule, rather than relying on the in-process `@Cron` decorator.

4. **Database** — Switch to managed PostgreSQL (AWS RDS / GCP Cloud SQL) with read replicas for reporting queries. Prisma supports connection pooling via PgBouncer, which should be deployed as a sidecar or connection pooler.

5. **Redis** — Use managed Redis (AWS ElastiCache / GCP Memorystore). Separate Redis instances for tokens vs. cache to avoid eviction of session data.

6. **Session Affinity** — Not required. JWT tokens in `Authorization` header make every request stateless.

7. **Static Assets** — Serve the React frontend build from a CDN (CloudFront / Cloudflare), not from Nginx. The Nginx container becomes unnecessary in this setup; the API can be exposed via an Ingress controller directly.

8. **CI/CD** — Use GitHub Actions pipeline: lint → test → build (Docker images) → push to container registry → deploy to Kubernetes via Helm or Kustomize. Use separate namespaces for staging and production.
