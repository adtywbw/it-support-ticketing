# IT Support Ticketing System

Full-stack ticketing application for internal IT support, built with **NestJS**, **React 18**, **PostgreSQL**, **Redis**, and **Docker**.

## Architecture

```
  ┌───────────────────┐     docker build      ┌──────────────────┐
  │  Frontend Builder │──── target: builder ──▶│  frontend_dist  │
  │  (vite build)     │     cp /app/dist/*     │  (named volume) │
  └───────────────────┘     → /export/         └────────┬─────────┘
                                                          │
                                                          ▼
   ┌──────────┐     ┌──────────────┐    ┌──────────────────┐
   │ Browser  │────▶│  Nginx :80   │◀───│ /usr/share/      │
   │          │     │  reverse     │    │ nginx/html       │
   └──────────┘     │  proxy       │    └──────────────────┘
                    └──────┬───────┘
                           │ /api/
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

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS + TypeScript (strict), Prisma ORM |
| Frontend | React 18 + Vite, TanStack Query v5, Zustand, Tailwind CSS v3 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 (password-protected; refresh tokens httpOnly cookie, cron/backup locks, maintenance flags) |
| Proxy | Nginx (rate limit 10r/s, gzip, reverse proxy, security headers) |
| Auth | JWT access (15m, in-memory) + refresh token (7d, httpOnly cookie), bcrypt cost 12 |

## Features

### User & Role Management
- **EndUser** — create tickets, view own tickets, add public comments/attachments to own tickets, close own resolved tickets
- **ITSupport** — view queue, claim/assign, reply, add internal notes, change status/priority/assignee (inline from ticket list)
- **Admin** — manage users/roles, categories, sub-categories, SLA configs, create/delete tickets

### Ticketing
- Auto-generated ticket number (`TKT-XXX`, numeric sequence via raw SQL)
- Status workflow: `Open → InProgress → Resolved → Closed` (with `OnHold` loop)
- Priority: Low, Medium, High, Critical
- Public & internal comments with file attachments (max 3/comment, 5MB each, allowed MIME types, image preview)
- File attachments (max 5/ticket, 10MB each, magic-byte validation, safe filenames, public/internal visibility)
- Full audit trail on status/assignee/priority changes
- Filter by status, priority, category, assigned to me, date range (dropdown presets: All Time, Today, Last 7 Days, Last 30 Days, This Month, Custom)
- Export CSV with current filters (ITSupport & Admin)

### SLA Management
- Configurable SLA per category + priority
- `slaDueAt` auto-calculated on ticket creation
- Background cron every 5 minutes checks SLA breach (Redis lock for horizontal scaling)
- SLA status: `OnTrack`, `AtRisk` (≤20% remaining), `Breached`

### Dashboard & Statistics
- Ticket counts by status and priority
- Daily trends (7d and 30d)
- SLA compliance rate
- Average resolution time per category (smart unit: hours/minutes/seconds)

### Notifications
- In-app notification system (table-based)
- Dropdown toggle in navbar with recent notifications
- Mark all as read & Clear all from dropdown and full page
- Click notification → navigate to ticket
- Triggers: new ticket, status change, assignment, new comment
- Requester also notified on ticket creation and status updates (if not ITSupport/Admin)
- Event-driven design (`@nestjs/event-emitter`) — extensible to email/Slack

### Telegram Integration (Admin)
- Bot polling via raw `fetch` API (long-polling, non-blocking `setTimeout` loop)
- Personal linking: Admin generates code → sends `/start <code>` to bot → chat ID saved to user
- Configurable via Admin My Account: bot token, enabled events, group chat, message templates
- Test Notification button — sends test message respecting group/individual settings, with real-time Telegram API error feedback
- Check Config button — validates bot token (`getMe`) + group chat ID (`getChat`) with inline ✅/❌ status
- Template variables: `{ticketNumber}`, `{subject}`, `{priority}`, `{createdBy}`, `{oldStatus}`, `{newStatus}`, `{assignedBy}`, `{url}`
- Token stored in DB, never sent to frontend (masked with `hasBotToken` flag)

### Maintenance Backups (Admin)
- Create, list, download, and delete operational backups from `/admin/maintenance`
- `DB` downloads `db.sql.gz`, a PostgreSQL logical dump
- `Uploads` downloads `uploads.tar.gz`, an archive of uploaded attachment files
- Delete uses the same confirmation dialog pattern as other destructive actions
- Restore performs a full DB + uploads restore, validates safe upload archives, requires typed backup ID confirmation, creates a pre-restore backup automatically, clears frontend cache, and forces login again after success
- **Maintenance Mode**: Admin must enable maintenance mode first before backup/restore buttons become active. During maintenance, non-admin users see an overlay banner and cannot access the system. Restore auto-enables maintenance mode for the entire duration (typically 15-60 seconds), then auto-disables when complete.

### UI/UX
- Dark mode toggle (persisted to localStorage, default light)
- Sidebar minimize/expand with icon-only mode
- Password reveal on hold (eye icon on all password fields)
- Responsive mobile layout with hamburger menu

### Security
- Helmet security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, etc.)
- Global exception filter — consistent `{ error: { code, message } }` error format
- Unexpected 500 errors return a generic message instead of leaking internal exception details
- JWT auth with short-lived access tokens (in-memory) + rotating refresh tokens (httpOnly cookie, Redis-backed)
- Logout revokes the active refresh token from Redis; inactive users are rejected at login/refresh/JWT validation
- Env validation at startup — app throws if `JWT_SECRET`, `DATABASE_URL`, or `REDIS_URL` is missing; production also requires `REDIS_PASSWORD` and rejects known weak `JWT_SECRET` placeholders
- WebSocket gateway authenticates connections via JWT verification + checks `isActive` in DB
- bcrypt password hashing (cost 12)
- Self-service password change (current password verification)
- class-validator DTO validation with `whitelist` + `forbidNonWhitelisted`
- Role-based access control + ownership-based guards (EndUser restricted to own tickets/comments/attachments only)
- Internal comments and internal attachments are hidden from EndUser responses/downloads
- EndUser ticket `_count` reflects only visible comments/attachments, not internal counts
- Upload filenames generated server-side (`uuid + safe extension`); download filenames are sanitized and `LocalStorageService` validates path containment
- Upload endpoints enforce Multer size/count/MIME limits before service persistence
- CSV export neutralizes spreadsheet formula injection
- Nginx + NestJS rate limiting (10 req/s per IP each layer)
- EndUser status changes restricted to closing own resolved tickets
- `MaintenanceGuard` global guard blocks non-admin requests during maintenance mode (stored in Redis)
- Restore does not disable maintenance mode on failure — stays active until restore completes
- Telegram config API response strips secrets; only `hasBotToken`/`hasGroupChatId` flags returned to frontend

## Project Structure

```
it-support-ticketing/
├── docker-compose.yml         # Multi-container setup
├── .env.example               # Environment variables template
├── scripts/
│   └── backup.sh              # Backup PostgreSQL dump + uploads volume
├── nginx/
│   ├── nginx.conf             # Reverse proxy + rate limiting
│   └── certs/                 # SSL cert & key placeholder (gitignored, for future HTTPS setup)
├── backend/
│   ├── Dockerfile             # Multi-stage build (Debian bookworm-slim)
│   ├── docker-entrypoint.sh    # chown mounted uploads/backups, then run as node
│   ├── prisma/
│   │   ├── schema.prisma      # 10 models + 5 enums + indexes
│   │   └── seed.ts            # Admin user, categories, sample ticket
│   └── src/
│       ├── auth/              # JWT auth, login/refresh/logout
│       ├── tickets/           # CRUD, filtering, pagination, status workflow
│       ├── comments/          # Public/internal comments
│       ├── attachments/       # File upload with StorageService abstraction
│       ├── categories/        # Master data management
│       ├── sub-categories/
│       ├── sla/               # Config + cron breach checker
│       ├── notifications/     # Event-driven + WebSocket gateway
│       ├── telegram/          # Bot polling, sendMessage, link/unlink, config CRUD
│       ├── maintenance/       # Admin backup API
│       ├── dashboard/         # Statistics & analytics
│       ├── users/             # Admin user management
│       ├── health/            # DB + Redis health check
│       ├── prisma/            # PrismaService
│       ├── redis/             # ioredis provider
│       └── common/            # Guards, decorators, interceptors, filters, repositories
├── frontend/
│   ├── Dockerfile             # Multi-stage build (Vite build → nginx static)
│   └── src/
│       ├── lib/               # Axios client, utility functions
│       ├── types/             # TypeScript type definitions
│       ├── stores/            # Zustand stores (auth, notifications)
│       ├── hooks/             # TanStack Query hooks (useTickets, useAuth, useMaintenance, etc.)
│       ├── auth/              # LoginForm, ProtectedRoute
│       ├── layout/            # Sidebar, Navbar, Layout
│       ├── components/
│       │   ├── tickets/       # TicketList, CreateTicketForm, TicketDetail, etc.
│       │   ├── dashboard/     # DashboardStats (cards, bars, trends)
│       │   ├── admin/         # UserManagement, MasterDataManagement
│       ├── auth/              # LoginForm, ProtectedRoute
│       ├── layout/            # Sidebar, Navbar, Layout
│       ├── components/
│       │   ├── tickets/       # TicketList, CreateTicketForm, TicketDetail, etc.
│       │   ├── dashboard/     # DashboardStats (cards, bars, trends)
│       │   ├── admin/         # UserManagement, MasterDataManagement
│       │   └── ui/            # Modal, Pagination, ErrorBoundary, LoadingSpinner, etc.
│       └── pages/             # 9 pages (tickets, detail, create-ticket, dashboard, notifications, my-account, admin-users, admin-master)
└── uploads/                   # File attachments volume
```

## Database Schema

10 tables with proper indexes and foreign keys:

- **users** — roles: EndUser, ITSupport, Admin; composite index on (role, isActive)
- **tickets** — status workflow, SLA tracking, indexes on (status, assignedTo, requesterId, createdAt, slaDueAt)
- **comments** — PUBLIC/INTERNAL types, linked to attachments
- **attachments** — magic-byte/MIME validation, max size enforcement, optional FK to comments, `visibility` (`PUBLIC`/`INTERNAL`)
- **categories** / **sub_categories** — hierarchical master data
- **sla_configs** — unique (categoryId, priority)
- **ticket_history** — audit trail for all state changes; indexed on (userId, createdAt)
- **notifications** — per-user with read/unread status
- **telegram_config** — global Telegram bot config (token, events, templates) stored as JSON

## Quick Start

### Prerequisites
- Docker & Docker Compose v2
- Git

### Setup

```bash
# 1. Clone and enter
git clone <repo-url> && cd it-support-ticketing

# 2. Environment variables for Docker Compose
cp backend/.env.compose.example backend/.env
# Edit secrets in backend/.env: JWT_SECRET, POSTGRES_PASSWORD, DATABASE_URL,
# REDIS_PASSWORD, and REDIS_URL. backend/.env is the canonical source for API,
# DB, Redis, and backup.sh when running via docker compose.
# Wajib: JWT_SECRET, DATABASE_URL, REDIS_URL, dan REDIS_PASSWORD harus diset.
# Telegram: TELEGRAM_BOT_TOKEN opsional (bisa diisi via Admin UI nanti)

# 3. Build and run (database + frontend build automatically on first start)
docker compose up --build

# 4. Seed default admin/support users once for a fresh install
docker compose exec api node dist/prisma/seed.js
```

The app will be available at `http://helpdesk.rsmch.internal`.

> **Note:** The frontend is built automatically during `docker compose build` (`target: builder` stage).
> At runtime, the `frontend` service copies `/app/dist` to the shared named volume `frontend_dist`.
> Nginx reads static files from the same volume (`frontend_dist:/usr/share/nginx/html`).
> Docker production containers do not run seed automatically; run the seed command once when provisioning a fresh install.
> For a clean rebuild without deleting data: `docker compose up --build`.
>
> **Tips:**
> - Build specific service only: `docker compose build api` or `docker compose build frontend`
> - Start without rebuild: `docker compose up -d` (uses existing images)
> - Clean dangling images: `docker image prune -f`

Compose nginx is the public edge in the default topology and does not trust client-supplied `X-Forwarded-For` as the real IP. If you add an upstream reverse proxy, configure nginx to trust only that proxy's exact IP/subnet before relying on forwarded real IP headers.

### Without Docker

```bash
# Backend
cd backend
cp .env.local.example .env
# Ensure local PostgreSQL and Redis match DATABASE_URL and REDIS_URL in .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts     # requires ts-node installed globally or via npx
npm run start:dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

### Seed Data

The seed script creates:
- **Admin** user: `admin@company.com` / `Admin123!`
- **IT Support** user: `support@company.com` / `Support123!`
- 2 categories (Hardware, Software) with SLA configs
- 1 sample ticket

Production containers do not run seed automatically. If the seed script is run manually, existing default users keep their current password and the sample ticket is skipped when `NODE_ENV=production`.

**Production seed**: requires `SEED_ADMIN_PASSWORD` and `SEED_SUPPORT_PASSWORD` environment variables. If either is missing, seed throws an error. Production credentials are never logged to stdout.

### Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@company.com | Admin123! |
| ITSupport | support@company.com | Support123! |

> **Production**: Default credentials above are for development only. In production, set `SEED_ADMIN_PASSWORD` and `SEED_SUPPORT_PASSWORD` env vars before running seed.

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login — sets refresh token as httpOnly cookie, returns `accessToken` + `user` |
| POST | `/api/auth/refresh` | Refresh access token — reads refresh token from cookie (no body needed), returns `accessToken` + `user` |
| POST | `/api/auth/logout` | Invalidate refresh token + clear cookie |
| POST | `/api/auth/change-password` | Change own password |

### Tickets
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tickets` | List (paginated, filtered, sorted) |
| POST | `/api/tickets` | Create ticket (authenticated users; EndUser creates own ticket) |
| GET | `/api/tickets/export/csv` | Export CSV (ITSupport & Admin) |
| GET | `/api/tickets/:id` | Ticket detail |
| PATCH | `/api/tickets/:id/status` | Update status |
| PATCH | `/api/tickets/:id/assign` | Assign ticket |
| PATCH | `/api/tickets/:id/priority` | Update priority |
| DELETE | `/api/tickets/:id` | Delete ticket (Admin only) |

### Comments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tickets/:ticketId/comments` | List comments (includes attachments) |
| POST | `/api/tickets/:ticketId/comments` | Add comment — multipart/form-data (`content`, `type`, `files` up to 3) |

### Attachments
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tickets/:ticketId/attachments` | Upload file (EndUser own ticket only) |
| GET | `/api/tickets/:ticketId/attachments` | List attachments (EndUser own ticket only; internal attachments hidden) |
| GET | `/api/attachments/:id/download` | Download file (EndUser own ticket only; internal attachments denied) |

### Notifications
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | List (paginated) |
| PATCH | `/api/notifications/:id/read` | Mark as read |
| PATCH | `/api/notifications/read-all` | Mark all as read |
| DELETE | `/api/notifications` | Clear all notifications |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List (ITSupport & Admin, `?includeInactive=true` for all) |
| POST/PATCH/DELETE | `/api/users/:id` | Create / Update / Hard-delete (Admin only) |
| GET/POST | `/api/categories` | List / Create categories |
| PATCH/DELETE | `/api/categories/:id` | Update / Delete category |
| GET/POST | `/api/categories/:id/sub-categories` | List / Create sub-categories |
| PATCH/DELETE | `/api/categories/:categoryId/sub-categories/:id` | Update / Delete sub-category |
| GET/POST | `/api/sla-configs` | List / Create SLA configs |
| PATCH | `/api/sla-configs/:id` | Update SLA config |
| GET/POST | `/api/maintenance/backups` | List / Create operational backups (Admin only) |
| DELETE | `/api/maintenance/backups/:id` | Delete an operational backup folder (Admin only) |
| POST | `/api/maintenance/backups/:id/restore` | Full restore database + uploads from a backup (Admin only; auto maintenance mode) |
| GET | `/api/maintenance/backups/:id/download/db` | Download database backup (Admin only) |
| GET | `/api/maintenance/backups/:id/download/uploads` | Download uploads backup (Admin only) |
| GET | `/api/maintenance/mode` | Get maintenance mode status (Public) |
| PATCH | `/api/maintenance/mode` | Toggle maintenance mode on/off (Admin only) |

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard/stats` | All dashboard statistics |

### Telegram
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/telegram/status` | Check if current user is linked |
| POST | `/api/telegram/link` | Generate link code (6-digit, 5 min expiry) |
| DELETE | `/api/telegram/link` | Unlink Telegram |
| GET | `/api/telegram/config` | Get config (Admin only) |
| PUT | `/api/telegram/config` | Update config (Admin only) |
| POST | `/api/telegram/test-notification` | Send test notification (Admin only) |
| POST | `/api/telegram/check` | Check bot token & group chat config (Admin only) |

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | DB + Redis status + maintenance mode status |

## Frontend Pages

| Route | Page | Access |
|-------|------|--------|
| `/login` | Login form | Public |
| `/tickets` | Ticket list (own/all) | Authenticated |
| `/tickets/new` | Create ticket form | Authenticated |
| `/tickets/:id` | Ticket detail + comments | Authenticated |
| `/dashboard` | Statistics & charts | ITSupport, Admin |
| `/notifications` | In-app notifications | Authenticated |
| `/my-account` | Profile info and self-service password change | Authenticated |
| `/admin/users` | User management | Admin |
| `/admin/master-data` | Categories, SLA configs | Admin |
| `/admin/maintenance` | Backup create/list/download/delete/restore + restore instructions | Admin |

## API Response Format

All success responses are wrapped in `{ data, meta? }` envelope by `TransformInterceptor` (global). Stream/CSV/blob responses are excluded.

```json
// Success
{ "data": ..., "meta": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 } }

// Error
{ "error": { "code": "BAD_REQUEST", "message": "Validation failed" } }
```

Frontend uses `unwrapData<T>()` and `unwrapPage<T>()` helpers from `frontend/src/lib/axios.ts` to extract data from the envelope.

## Docker Services

| Service | Image / Build | Port | Restart | Healthcheck | Logging |
|---------|---------------|------|---------|-------------|---------|
| frontend | `frontend/Dockerfile` (target: builder) | — | unless-stopped | — | 10m x 3 files |
| nginx | nginx:1.25-alpine | 80 | unless-stopped | — | 10m x 3 files |
| api | `backend/Dockerfile` (node:20-bookworm-slim, non-root via entrypoint) | 127.0.0.1:3000 | unless-stopped | `GET /health` (30s) | 10m x 3 files |
| db | postgres:16-alpine | — | unless-stopped | `pg_isready` (10s) | 10m x 3 files |
| cache | redis:7-alpine | — | unless-stopped | `redis-cli ping` (10s) | 10m x 3 files |

## Backup

Run a backup while Docker Compose services are up and maintenance mode is enabled:

```bash
./scripts/backup.sh
```

The script refuses to run while maintenance mode is off because a live DB dump plus uploads archive can be inconsistent. If an operator intentionally accepts that risk, use `./scripts/backup.sh --live-ok`.

The script reads environment variables from `backend/.env` (canonical source) and creates a timestamped directory under `backups/` containing:
- `db.sql.gz` — PostgreSQL logical dump (`pg_dump --schema public`) containing all tables: users, tickets, comments, attachments, categories, sub_categories, sla_configs, ticket_history, notifications, telegram_config
- `uploads.tar.gz` — archive of the `uploads_data` volume mounted at `/app/uploads` (all attachment files)
- `manifest.txt` — timestamp and backup metadata

> **Note:** Redis is not included in backups. After a restore, refresh tokens and cache are lost — all users must log in again.

`backups/` is gitignored. Store backup copies outside the server as part of production operations.

Admins can also create, list, download, delete, and restore backups from `/admin/maintenance`. The UI creates the same `db.sql.gz`, `uploads.tar.gz`, and `manifest.txt` set under `backups/<timestamp>/`. Restore is destructive, requires typed backup ID confirmation, creates a fresh pre-restore backup automatically, and requires login again after success. Admin must enable maintenance mode before backup/restore buttons become active in the UI.

The API image installs `postgresql-client-16` to match the PostgreSQL 16 server. Its entrypoint fixes ownership of mounted `/app/uploads` and `/app/backups`, then drops privileges so the NestJS process still runs as `node`.

## Testing & Lint

```bash
# Backend unit tests
cd backend
npm run test

# Frontend lint (zero warnings policy)
cd frontend
npm run lint
```

Unit test for TicketsService covers:
- `create()` — happy path, category not found error, ticket number format, SLA calculation
- `findAll()` — pagination, search filtering
- `updateStatus()` — valid transitions, invalid transitions (BadRequestException), not found

Unit test for AttachmentVisibilityPolicy covers:
- `buildVisibleAttachmentWhere` — returns undefined for ITSupport/Admin, returns visibility=PUBLIC filter for EndUser
- `buildVisibleAttachmentCountWhere` — returns filter requiring PUBLIC visibility
- `isAttachmentVisible` — EndUser sees only PUBLIC direct attachments and PUBLIC comment attachments; ITSupport/Admin see all

## Scaling

See [ARCHITECTURE.md](./ARCHITECTURE.md#6-scaling-suggestions) for detailed scaling guide:

1. Stateless API — ready for horizontal scaling (HPA)
2. File upload — switch to S3/GCS via `StorageService` interface
3. Cron job — extract to Kubernetes CronJob
4. Database — managed PostgreSQL with read replicas
5. Redis — managed, separate instances for tokens vs cache
6. CDN — serve frontend from CloudFront/Cloudflare
7. CI/CD — GitHub Actions → registry → Kubernetes
