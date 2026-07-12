# Architecture Documentation — IT HelpDesk

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
| Containerization | Docker | Reproducible deployment, identical dev/prod environment. The API runtime uses a Debian/bookworm-slim Node image to avoid native-module and Prisma engine compatibility issues. Supporting services and the frontend static build/export path intentionally use Alpine-based images where the current Compose/Dockerfiles already specify them (`nginx:alpine`, `postgres:16-alpine`, `redis:7-alpine`, and the frontend builder/runtime image). |
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
| `AttachmentRepository` | `attachment` | `AttachmentsService`, `CommentsService`; also `findAllPaths()` for stale-file cleanup cron |
| `CategoryRepository` | `category` | `CategoriesService`, `TicketsService`, `SLAService` |
| `SubCategoryRepository` | `subCategory` | `SubCategoriesService`, `TicketsService` |
| `SlaConfigRepository` | `sLAConfig` | `SLAService`; also `findAllActive()` for pre-loaded config map in `performSLACheck` |
| `NotificationRepository` | `notification` | `NotificationsService` |
| `TelegramConfigRepository` | `telegramConfig` | `TelegramService` |
| `FaqRepository` | `faq` | `FaqsService` |
| `FaqInteractionRepository` | `faqInteraction` + raw SQL | `FaqsService` |
| `LocationRepository` | `location` | `LocationsService` |
| `AuditLogRepository` | `auditLog` | `AuditService`, `AuditLogsService` |

The `MaintenanceModule` is intentionally operational rather than domain-persistent: it uses filesystem access and OS tools (`pg_dump`, `gzip`, `tar`) to create, download, and delete backups under `/app/backups`, and is restricted to Admin users. It also manages a maintenance mode flag stored in Redis that blocks non-admin API requests via `MaintenanceGuard` while allowing Admin through via JWT verification.

All repositories are exported from `RepositoriesModule` (marked `@Global()`) and registered once in `AppModule`. All modules that inject repositories explicitly import `RepositoriesModule` in their `imports` array — no silent `@Global()` reliance.

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
│ notificationPreferences    JSONB? (nullable — per-event enable/disable map)
│ createdAt                  DateTime
│ updatedAt                  DateTime
│ INDEXES: (email), (role), (role, isActive), (createdAt)
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
│ FK locationId → locations    UUID? (nullable)
│ itemCode                   VARCHAR(50)  @default("-")
│ priority                  Priority  (Low|Medium|High|Critical)
│ status                   TicketStatus (Open|InProgress|OnHold|Resolved|Closed)
│ FK assignedToId → users    UUID? (nullable)
│ channel                   Channel  (Web)
│ slaDueAt                  DateTime? (nullable)
│ slaStatus                 SLAStatus? (nullable — OnTrack|AtRisk|Breached)
│ resolvedAt                DateTime? (nullable)
│ closedAt                  DateTime? (nullable)
│ createdAt                  DateTime
│ updatedAt                  DateTime
│ INDEXES: (status), (assignedToId), (requesterId), (createdAt),
│          (slaDueAt), (priority), (categoryId), (subCategoryId),
│          (slaStatus), (updatedAt), (requesterId, createdAt),
│          (assignedToId, status), (status, slaStatus)
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
│ 1──< faqs (subCategoryId)
│ 1──< faq_interactions (subCategoryId)
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
│ INDEXES: (ticketId), (createdAt), (ticketId, createdAt), (userId)
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
│ INDEXES: (ticketId), (commentId), (ticketId, visibility), (userId)
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
│ NOTE: create and timing update auto-recalculate affected non-terminal
│       tickets' slaDueAt and slaStatus via SLAService. When no SLA
│       config matches (categoryId, priority), both are null.
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
│ INDEXES: (ticketId), (userId), (createdAt), (ticketId, createdAt)
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
│ INDEXES: (userId, isRead), (createdAt), (userId, isRead, createdAt)
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

┌─────────────────────────────────────────────────────────────────────┐
│ locations
│ PK id (UUID)
│ name (UNIQUE)               VARCHAR
│ isActive                   Boolean
│ createdAt                  DateTime
│ updatedAt                  DateTime
│ INDEXES: (isActive)
│ 1──< tickets (locationId) — ON DELETE SET NULL
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ faqs
│ PK id (UUID)
│ question                   VARCHAR
│ answer                     TEXT
│ keywords                   VARCHAR[]? (nullable)
│ displayOrder               Int     @default(0)
│ isActive                   Boolean
│ showOnLogin                Boolean               @default(false)
│ FK subCategoryId → sub_categories  UUID          (ON DELETE Restrict)
│ createdAt                  DateTime
│ updatedAt                  DateTime
│ INDEXES: (subCategoryId, isActive)
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ faq_interactions
│ PK id (UUID)
│ sessionId                  String
│ userId                     String? (nullable, ON DELETE SetNull)
│ FK faqId → faqs            String? (nullable, ON DELETE SetNull)
│ FK subCategoryId → sub_categories  String          (ON DELETE Cascade)
│ eventType                  FaqInteractionType (RecommendationsShown|ArticleOpened|ProblemResolved|TicketCreated)
│ createdAt                  DateTime
│ INDEXES: (createdAt), (sessionId, eventType), (faqId, createdAt), (subCategoryId, createdAt)
│ NOTE: Privacy-safe — stores no session IP, user agent, or ticket
│       content. Rows older than 180 days removed by daily cleanup.
└─────────────────────────────────────────────────────────────────────┘

Additionally, `GET /api/faqs/recommendations` returns up to five active FAQs ranked by sub-category, subject, and keyword match — requires `subCategoryId`. `POST /api/faqs/interactions` records self-service events (60 req/min/user throttle); uses `subCategoryId` (not `categoryId`). `GET /api/faqs/analytics` provides Admin-only 30-day deflection summary with `subCategoryStats` (not `categoryStats`). All interaction events are privacy-safe and never store ticket subjects, descriptions, IP addresses, or user agents.

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
│       │   │   ├── public.decorator.ts
│       │   │   └── roles.decorator.ts
│       │   ├── filters/
│       │   │   └── http-exception.filter.ts
│       │   ├── guards/
│       │   │   ├── app-throttler.guard.ts   # Per-user rate-limit key (user:{id})
│       │   │   ├── csrf.guard.ts           # CSRF: checks X-Requested-With on state-changing requests
│       │   │   ├── jwt-auth.guard.ts
│       │   │   ├── maintenance.guard.ts
│       │   │   └── roles.guard.ts
│       │   ├── interceptors/
│       │   │   └── transform.interceptor.ts
│       │   ├── interfaces/
│       │   │   ├── api-response.interface.ts
│       │   │   └── jwt-payload.interface.ts
│       │   ├── policies/
│       │   │   └── attachment-visibility.policy.ts
│       │   ├── config/
│       │   │   ├── app.config.ts
│       │   │   └── jwt.config.ts
│       │   ├── services/
│       │   │   ├── audit.service.ts        # Structured event logging
│       │   │   └── services.module.ts      # @Global()
│       │   ├── utils/
│       │   │   ├── concurrency.util.ts
│       │   │   ├── env-validation.util.ts
│       │   │   ├── mime-validation.util.ts
│       │   │   ├── notification-preference.util.ts
│       │   │   ├── pagination.util.ts
│       │   │   ├── time.util.ts
│       │   │   ├── transform.util.ts
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
│       │       ├── location.repository.ts
│       │       ├── telegram-config.repository.ts
│       │       ├── faq.repository.ts
│       │       ├── faq-interaction.repository.ts
│       ├── auth/
│       │   ├── auth.module.ts
│       │   ├── auth.controller.ts
│       │   ├── auth.service.ts
│       │   ├── cookie-options.ts
│       │   ├── dto/
│       │   │   ├── login.dto.ts
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
│       ├── faqs/
│       │   ├── faqs.module.ts
│       │   ├── faqs.controller.ts
│       │   ├── faqs.service.ts
│       │   └── dto/
│       │       ├── create-faq.dto.ts
│       │       ├── update-faq.dto.ts
│       │       ├── query-faq-recommendations.dto.ts
│       │       ├── create-faq-interaction.dto.ts
│       │       └── query-faq-analytics.dto.ts
│       ├── sub-categories/
│       │   ├── sub-categories.module.ts
│       │   ├── sub-categories.controller.ts
│       │   ├── sub-categories.service.ts
│       │   └── dto/
│       ├── locations/
│       │   ├── locations.module.ts
│       │   ├── locations.controller.ts
│       │   ├── locations.service.ts
│       │   └── dto/
│       │       ├── create-location.dto.ts
│       │       └── update-location.dto.ts
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
│       │   ├── notifications.service.ts
│       │   └── dto/
│       │       └── update-notification-preferences.dto.ts
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
│       │   ├── dashboard.service.ts
│       │   └── dto/
│       │       └── query-dashboard-stats.dto.ts
│   └── health/
│       ├── health.module.ts
│       └── health.controller.ts
├── backend/src/audit-logs/
│   ├── audit-logs.module.ts
│   ├── audit-logs.controller.ts
│   ├── audit-logs.service.ts
│   └── dto/
│       └── query-audit-log.dto.ts
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
│       │   ├── sla-time.ts
│       │   ├── thumbnail-cache.ts
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
│       │   ├── use-notification-preferences.ts
│       │   ├── use-telegram.ts
│       │   ├── use-maintenance.ts
│       │   ├── use-sla-configs.ts
│       │   ├── use-change-password.ts
│       │   ├── use-locations.ts
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
│       │   ├── account/
│       │   │   └── NotificationPreferencesSection.tsx
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
│       │   │   ├── DashboardStats.tsx
│       │   │   ├── DashboardRangeFilter.tsx
│       │   │   ├── CurrentSnapshotCards.tsx
│       │   │   ├── NeedAttentionSection.tsx
│       │   │   └── AnalyticsSection.tsx
│       │   ├── admin/
│       │   │   ├── UserManagement.tsx
│       │   │   ├── MasterDataManagement.tsx
│       │   │   ├── SLAConfigManager.tsx
│       │   │   └── FaqManager.tsx
│       │   └── ui/
│       │       ├── BrandMark.tsx
│       │       ├── Badge.tsx
│       │       ├── Table.tsx
│       │       ├── Switch.tsx
│       │       ├── Modal.tsx
│       │       ├── Pagination.tsx
│       │       ├── LoadingSpinner.tsx
│       │       ├── EmptyState.tsx
│       │       ├── ErrorMessage.tsx
│       │       ├── ErrorBoundary.tsx
│       │       ├── ConfirmDialog.tsx
│       │       ├── FaqSection.tsx
│       │       └── PasswordInput.tsx
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
- The API runtime uses a Debian/bookworm-slim Node image to avoid native-module and Prisma engine compatibility issues. Supporting services and the frontend static build/export path intentionally use Alpine-based images where the current Compose/Dockerfiles already specify them (`nginx:alpine`, `postgres:16-alpine`, `redis:7-alpine`, and the frontend builder/runtime image).

### Database Migration
- The container's entry point (`docker-entrypoint.sh`, shebang `#!/bin/bash` — requires `set -o pipefail`) runs `node node_modules/.bin/prisma migrate deploy` with a 3-retry loop (10s delay between attempts, 30s sleep before final exit) before starting the app.
  - `migrate deploy` applies pending migrations (versioned, rollbackable). Safer than `db push` for production — no accidental data loss.
  - Uses the local `node_modules/.bin/prisma` binary directly rather than `npx`, ensuring deterministic resolution even if the npm cache is absent.
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
- `scripts/backup.sh` creates a timestamped backup under `backups/` while Compose services are running. It acquires `maintenance:backup:lock` in Redis via `SET NX EX 600` before proceeding and renews it every 120 seconds via a background heartbeat, preventing races with API-initiated backups/restores. The lock is token-matched on renew/release so concurrent operations cannot take over each other's lock.
- `backup.sh` reads environment variables from `backend/.env` (canonical source for the API service). The `POSTGRES_PASSWORD` in `backend/.env` must match `backend/.env.db` so the script can authenticate to the `db` container.
- The database backup uses `docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip`.
- The upload backup uses `docker compose run --rm --no-deps api tar -czf ... -C /app/uploads .`, so Compose resolves the `uploads_data` named volume instead of relying on host paths.
- Backup output contains `db.sql.gz`, `uploads.tar.gz`, and `manifest.txt`; `backups/` is gitignored and should be copied off-host for production retention.
- `db.sql.gz` contains the full `public` schema: users, tickets, comments, attachments, categories, sub_categories, sla_configs, ticket_history, notifications, telegram_config. Redis is not backed up — refresh tokens, cache, and maintenance flags are lost after restore.
- Admin UI backup uses `/api/maintenance/backups`, runs inside the API container, and writes to the same `./backups:/app/backups` mount.
- Admin UI backup uses `postgresql-client-16` to match PostgreSQL 16, parses `DATABASE_URL` into libpq env vars for `pg_dump`, preserves `schema` as `--schema`, and compresses the dump only after `pg_dump` succeeds.
- Admin UI backup exposes separate downloads: `DB` for `db.sql.gz` (PostgreSQL logical dump) and `Uploads` for `uploads.tar.gz` (attachment files). `DELETE /api/maintenance/backups/:id` removes the whole timestamped backup folder.
- Admin UI restore uses `POST /api/maintenance/backups/:id/restore` for full DB + uploads restore. It requires typed backup ID confirmation, validates both gzip files, validates upload archive entries against path traversal/symlink/hardlink abuse, creates a pre-restore backup automatically, restores DB via `psql`, restores uploads through a temporary directory swap (tempDir created inside `uploadDir` to avoid `EXDEV` cross-device rename), then requires the user to log in again.
- DB restore streams the gzip dump through a small SQL rewrite before `psql`: schema creation is made idempotent and `CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;` is injected before trigram indexes (`gin_trgm_ops`) are created. This is required because schema-only dumps can omit extensions even though indexes reference extension operator classes.
- DB restore pipeline (gzip → awk → psql) uses `set -o pipefail` and must run under `bash` via `execFileAsync('bash', ['-c', ...])` in `MaintenanceService.restoreDatabase()`. Using `'sh'` instead of `'bash'` causes `sh: set: Illegal option -o pipefail` and the entire restore fails. The old code (pre-Session 51) also left the DROP SCHEMA in an uncommitted psql transaction, so the drop was rolled back and the restore would fail with `type "AttachmentVisibility" already exists` — this is now fixed by committing DROP SCHEMA in its own psql call before the restore pipe.
- Restore flow: enable maintenance mode → 5-second drain time → create pre-restore backup → COMMIT DROP SCHEMA → import SQL + extract uploads → release `maintenance:restore:lock` → disable maintenance mode (only on success). `MaintenanceGuard` uses a 2-second in-memory cache + Redis `mget` to reduce round-trips and allows Admin through during maintenance via JWT verification while non-admin API calls return `503`. Locks use token-matched TTL renewal (heartbeat every 120s) so concurrent backup/restore operations cannot take over each other's lock. Total maintenance duration is typically 15-60 seconds depending on DB/upload size. If restore fails, maintenance mode remains active and the original error is logged via `Logger` — admin can recover using the pre-restore backup.
- Admin must enable maintenance mode from the UI before backup/restore buttons become active.
- Restore is destructive and should be run during a maintenance window.

### Production Deployment
> For a step-by-step production setup guide (env config, TLS options with mkcert, build/start, verify), see [README.md §Production Deployment](./README.md#production-deployment). This section covers runtime characteristics only.

- All services have `restart: unless-stopped` — containers auto-restart on crash.
- Backend production image installs dependencies with `npm ci --omit=dev`; `docker-entrypoint.sh` chowns `/app/uploads` and `/app/backups`, then uses `gosu` so the app still runs as the non-root `node` user.
- Compose does not expose the API port to the host by default. For local debugging, use `docker-compose.debug.yml` to bind `127.0.0.1:3000`; normal browser traffic enters through Nginx `/api/`, so Nginx rate limiting and upload body limits are not bypassed remotely.
- Nginx sets `client_max_body_size 20m`, accommodating the backend upload limits (10MB direct attachment, 5MB comment attachment).
- API healthcheck: `"CMD", "wget", "--spider", "-q", "http://localhost:3000/health"` — interval 30s, start_period 30s, 3 retries. Container is killed + restarted after 3 consecutive failures. Health endpoint returns HTTP 503 (not 200) when DB or Redis is unhealthy, so the healthcheck correctly detects outages.
- Security headers via `helmet` middleware (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, etc.) applied at NestJS application layer. Production `nginx.ssl.conf` adds a second layer: HSTS at the edge (`Strict-Transport-Security`), TLS hardening (`ssl_ciphers`, `ssl_prefer_server_ciphers`, `ssl_session_tickets off`), tightened CSP on static assets (no `ws: wss:` on `/assets/` and `/index.html`), and `object-src 'none'` to block Flash/Java plugin loads.
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
- Inactive users are rejected during login, refresh, JWT validation, and WebSocket connection validation. WebSocket sessions are also bounded to access-token expiry: `NotificationsGateway` reads `payload.exp` and schedules a `setTimeout` disconnect at expiry; already-expired tokens disconnect immediately. Timers are cleared on disconnect/deactivation. The `handleConnection()` method validates the `Origin` header against allowed CORS origins before processing any JWT, providing defense-in-depth alongside the `@WebSocketGateway` cors config.
- EndUser access is ownership-scoped: EndUser can create tickets as requester, can only view/comment/upload/list/download attachments for own tickets, and can only close own resolved tickets.
- EndUser cannot access `/dashboard` or admin routes; both backend roles and frontend routes/actions enforce this.
- INTERNAL comments, INTERNAL standalone attachments, and attachments attached to INTERNAL comments are hidden from EndUser ticket detail/list/download responses. Visibility is centralized via `AttachmentVisibilityPolicy` in `backend/src/common/policies/`.
- EndUser ticket `_count` reflects only visible comments/attachments (public + direct), not internal counts.
- File upload validation runs at the Multer interceptor layer (`limits` + MIME `fileFilter`) and again in service-level magic-byte checks before persistence.
- Upload filenames are generated server-side (`uuid + safe extension`); `originalName` stored in DB for display only. `LocalStorageService` validates path containment as defense-in-depth.
- CSV export escapes every field and neutralizes formula injection prefixes before download.
- `MaintenanceGuard` (global `APP_GUARD`) blocks non-essential API requests when maintenance mode is enabled. It injects `Reflector` to read `IS_PUBLIC_KEY` so it can distinguish public from protected routes. Allowed paths (`/health`, `/maintenance/*`, `/auth/*`) are checked BEFORE Redis access, so Redis outages do not block essential endpoints. If Redis is unreachable, the guard defaults to "allow" (fail-open) to prevent total system lockout. When maintenance is enabled, the guard verifies the JWT from `Authorization` header: Admin → allow through; non-admin → `503 { error: { code: 'MAINTENANCE', message } }`; expired/invalid token on a protected route → allow (let `JwtAuthGuard` handle 401 → frontend refresh); expired/invalid token on a public non-allowlisted route → 503 (public routes skip `JwtAuthGuard`, so they cannot fall through to 401); no token → 503.
- `TransformInterceptor` (global `APP_INTERCEPTOR`) wraps all success responses in `{ data, meta? }` envelope. Skips wrap for stream/CSV/blob responses. Frontend uses `unwrapData<T>()` and `unwrapPage<T>()` helpers to extract data from the envelope. Paginated `meta` always includes `{ page, limit, total, totalPages }` — `totalPages` is provided even when `total === 0` (use `1` for empty page).
- `HttpExceptionFilter` returns stable error codes (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `UNPROCESSABLE_ENTITY`, `TOO_MANY_REQUESTS`, `MAINTENANCE`, `INTERNAL_ERROR`) via `resp.code` or `getCodeFromStatus()` fallback.
- Dashboard stats are cached in Redis with range-aware keys (`dashboard:stats:v2:<range>`, 30s TTL). Cache operations are best-effort: Redis failures are caught and logged, and the dashboard falls back to uncached queries. `DashboardService` returns `{ current, attention, analytics }`, supports `7d`/`30d`/`90d`/custom ranges for analytics, and listens to `ticket.created`, `ticket.status.updated`, `ticket.assigned`, `ticket.priority.updated`, and `ticket.deleted` events via `EventEmitter2` to invalidate `dashboard:stats:v2:*` via `deleteByPattern` so stats stay fresh without waiting for the TTL.
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
- Frontend theme tokens live in `tailwind.config.js` and `src/index.css`. The Blue Operations theme uses `primary` (royal blue), `navy` (brand/dark surfaces), and `surface` (blue-tinted light surfaces). Shared global component classes include `.card`, `.card-header`, and `.card-body`; dashboard and ticket detail cards depend on `.card-body` for spacing.
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

8. **CI/CD** — A GitHub Actions pipeline (`.github/workflows/ci.yml`) already runs backend + frontend lint, test, build on every push/PR to `main`. Extend with Docker image build → push to container registry → deploy to Kubernetes via Helm or Kustomize for a full DevOps pipeline. Use separate namespaces for staging and production.

## 7. Security Architecture

### Authentication & Authorization
- **JWT tokens**: access (15min, `tokenType: 'access'`) + refresh (7d, `tokenType: 'refresh'`, httpOnly cookie). Both signed with `JWT_SECRET` using `HS256` algorithm (pinned in both `JwtModule.registerAsync` and `JwtStrategy` to prevent algorithm-downgrade attacks). `tokenType` is required in payload — tokens without it are rejected.
- **Global auth guard**: `JwtAuthGuard` registered as `APP_GUARD` in `app.module.ts`. Fail-closed: any controller without `@Public()` requires authentication. `@Public()` applied to `HealthController`, `AuthController` (login/refresh/logout), `MaintenanceController.getMode()`.
- **Role guard key**: `RolesGuard` reads metadata via shared `ROLES_KEY` constant exported from `roles.decorator.ts` (not a string literal) so a typo cannot silently disable role checks.
- **Role-based access**: `RolesGuard` checks `@Roles(...)` metadata. EndUser restricted from dashboard, users, master data, maintenance.
- **Account lockout**: 10 failed login attempts → 15-minute Redis lock (`login:locked:{email}`). Prevents distributed brute-force.
- **Timing attack mitigation**: `validateUser()` performs dummy bcrypt compare for non-existent users to equalize response time.
- **Refresh token rotation**: old jti deleted on rotation; reuse detection revokes token. Stored in Redis with TTL matching JWT expiry.

### File Upload Security
- **Stale-file cleanup**: `AttachmentsService` runs a `@Cron('0 */6 * * *') cleanupOrphanedFiles()` that lists the uploads directory, cross-references against `Attachment` DB records via `findAllPaths()`, and removes files without matching DB entries. This is a best-effort guard against orphaned files from crashes during the upload flow (files are saved to disk before DB transaction commit).
- **Extension whitelist**: `upload.util.ts` — only `.jpg`, `.png`, `.pdf`, `.docx`, etc. Non-whitelisted extensions stripped.
- **Magic byte verification**: `mime-validation.util.ts` — 7 signatures in `MIME_SIGNATURES` (JPEG, PNG, GIF, PDF, ZIP, RAR, OLE2/DOC) plus a special-case handler for WebP (RIFF header with variable file-size bytes 4-7 skipped). Text files checked for null bytes. A `MIME_COMPATIBILITY_MAP` allows compatible container mismatches: OOXML files (`.docx`/`.xlsx`) are ZIP containers detected as `application/zip`, and legacy `.xls` shares the OLE2 CFB signature with `application/msword`. Obvious spoofing (e.g., ZIP declared as `image/png`) is still rejected. Shared across comments and attachments modules.
- **Path traversal prevention**: `path.basename()` + `resolvedPath.startsWith(uploadRoot)` double check.
- **`originalName` sanitization**: `path.basename()` + `substring(0, 255)` before DB storage.
- **`path` field exclusion**: `ATTACHMENT_SAFE_SELECT` and comment repository `select` — filesystem path never exposed to clients.
- **DTO input validation**: `CreateTicketDto` and `CreateCommentDto` use `@Transform(trimString)` + `@IsNotEmpty()` + `@MinLength()` so direct API clients cannot submit whitespace-only or too-short text payloads. `ValidationPipe` is enabled globally with `whitelist` and `forbidNonWhitelisted`.

### Infrastructure Security
- **Docker hardening**: `no-new-privileges`, `cap_drop: ALL` with minimal `cap_add`, `mem_limit`, `cpus`, `pids_limit`, `read_only`, `tmpfs`, and `init: true` on all services.
- **Least-privilege env**: `backend/.env.db` (DB only), `backend/.env.cache` (Redis only), `backend/.env` (API full set).
- **Nginx**: CSP, security headers repeated per location block (add_header inheritance), `default_server` for unmatched Host, dotfile deny.
- **Secret hygiene**: `.env` permission `600`, `.gitignore` covers `.env.*`, strong credentials via `openssl rand`.
- **Swagger gate**: OpenAPI docs at `/docs` are only mounted when `NODE_ENV !== 'production'` to prevent API schema exposure.
- **CI/CD**: GitHub Actions workflow (`.github/workflows/ci.yml`) runs build + test on every PR and push to `main`. Backend job uses PostgreSQL and Redis service containers.

## 8. Observability

### Structured JSON Logging
- **Custom logger**: `JsonLogger` extends NestJS `ConsoleLogger` — every log line is a JSON object with `timestamp`, `level`, `correlationId`, `context`, `message`, and optional `stack`.
- **Correlation ID**: `RequestIdMiddleware` generates or propagates `X-Request-ID` header, stored in `AsyncLocalStorage` via `requestContext.run()`. Every log emitted during a request lifecycle carries the same correlation ID, enabling distributed tracing across services.
- **Environment-aware levels**: Production logs only `log`/`error`/`warn`; development includes `debug`/`verbose`.
- **Morgan HTTP logging**: `morgan('combined')` middleware provides HTTP access logs alongside structured app logs.
