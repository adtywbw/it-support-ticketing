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
  ┌──────────┐     ┌─────────────────────┐    ┌──────────────────┐
  │ Browser  │────▶│  Nginx (:80)        │◀───│ /usr/share/      │
  │          │     │  reverse proxy      │    │ nginx/html       │
  └──────────┘     └──────────┬──────────┘    └──────────────────┘
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
| Cache | Redis 7 (refresh tokens httpOnly cookie, cron lock, cache) |
| Proxy | Nginx (rate limit 10r/s, gzip, reverse proxy) |
| Auth | JWT access (15m, in-memory) + refresh token (7d, httpOnly cookie), bcrypt cost 12 |

## Features

### User & Role Management
- **EndUser** — create tickets, comment, upload attachments, close resolved tickets
- **ITSupport** — view queue, claim/assign, reply, add internal notes, change status/priority/assignee (inline from ticket list)
- **Admin** — manage users/roles, categories, sub-categories, SLA configs, delete tickets

### Ticketing
- Auto-generated ticket number (`TKT-XXX`)
- Status workflow: `Open → InProgress → Resolved → Closed` (with `OnHold` loop)
- Priority: Low, Medium, High, Critical
- Public & internal comments with file attachments (max 3/comment, 5MB each, allowed MIME types, image preview)
- File attachments (max 3/ticket, 5MB each, allowed MIME types)
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
- Event-driven design (`@nestjs/event-emitter`) — extensible to email/Slack

### Telegram Integration (Admin)
- Bot polling via raw `fetch` API (long-polling, non-blocking `setTimeout` loop)
- Personal linking: Admin generates code → sends `/start <code>` to bot → chat ID saved to user
- Configurable via Admin My Account: bot token, enabled events, group chat, message templates
- Template variables: `{ticketNumber}`, `{subject}`, `{priority}`, `{createdBy}`, `{oldStatus}`, `{newStatus}`, `{assignedBy}`, `{url}`
- Token stored in DB, never sent to frontend (masked with `hasBotToken` flag)

### UI/UX
- Dark mode toggle (persisted to localStorage, default light)
- Sidebar minimize/expand with icon-only mode
- Password reveal on hold (eye icon on all password fields)
- Responsive mobile layout with hamburger menu

### Security
- JWT auth with short-lived access tokens (in-memory) + rotating refresh tokens (httpOnly cookie, Redis-backed)
- Env validation at startup — app throws if `JWT_SECRET` or `DATABASE_URL` is missing (no hardcoded fallback)
- WebSocket gateway authenticates connections via JWT verification
- bcrypt password hashing (cost 12)
- Self-service password change (current password verification)
- class-validator DTO validation (whitelist + forbidNonWhitelisted)
- Role-based & ownership-based authorization guards
- EndUser restricted to own tickets only (findAll + findById)
- Nginx rate limiting (10 req/s per IP)

## Project Structure

```
it-support-ticketing/
├── docker-compose.yml         # Multi-container setup
├── .env.example               # Environment variables template
├── nginx/
│   └── nginx.conf             # Reverse proxy + rate limiting
├── backend/
│   ├── Dockerfile             # Multi-stage build (Debian bookworm-slim)
│   ├── prisma/
│   │   ├── schema.prisma      # 9 models + 5 enums + indexes
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
│       ├── dashboard/         # Statistics & analytics
│       ├── users/             # Admin user management
│       ├── health/            # DB + Redis health check
│       ├── prisma/            # PrismaService
│       ├── redis/             # ioredis provider
│       └── common/            # Guards, decorators, interceptors, filters
├── frontend/
│   ├── Dockerfile             # Multi-stage build (Vite build → nginx static)
│   └── src/
│       ├── lib/               # Axios client, utility functions
│       ├── types/             # TypeScript type definitions
│       ├── stores/            # Zustand stores (auth, notifications)
│       ├── hooks/             # TanStack Query hooks (useTickets, useAuth, etc.)
│       ├── components/
│       │   ├── auth/          # LoginForm, ProtectedRoute
│       │   ├── layout/        # Sidebar, Navbar, Layout
│       │   ├── tickets/       # TicketList, CreateTicketForm, TicketDetail, etc.
│       │   ├── dashboard/     # DashboardStats (cards, bars, trends)
│       │   ├── admin/         # UserManagement, MasterDataManagement
│       │   └── ui/            # Modal, Pagination, ErrorBoundary, LoadingSpinner, etc.
│       └── pages/             # 10 pages (login, tickets, detail, create-ticket, dashboard, notifications, my-account, admin-users, admin-master)
└── uploads/                   # File attachments volume
```

## Database Schema

9 tables with proper indexes and foreign keys:

- **users** — roles: EndUser, ITSupport, Admin
- **tickets** — status workflow, SLA tracking, indexes on (status, assignedTo, requesterId, createdAt, slaDueAt)
- **comments** — PUBLIC/INTERNAL types, linked to attachments
- **attachments** — MIME validation, max size enforcement, optional FK to comments
- **categories** / **sub_categories** — hierarchical master data
- **sla_configs** — unique (categoryId, priority)
- **ticket_history** — audit trail for all state changes
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

# 2. Environment variables
cp .env.example backend/.env
# Edit secrets (JWT_SECRET, DATABASE_URL) in backend/.env
# Wajib: JWT_SECRET dan DATABASE_URL harus diset — startup akan throw error jika tidak ada
# Telegram: TELEGRAM_BOT_TOKEN opsional (bisa diisi via Admin UI nanti)

# 3. Build and run (database + frontend build automatically on first start)
docker compose up --build
```

The app will be available at `http://localhost`.

> **Note:** The frontend is built automatically during `docker compose build` (`target: builder` stage).
> At runtime, the `frontend` service copies `/app/dist` to the shared named volume `frontend_dist`.
> Nginx reads static files from the same volume (`frontend_dist:/usr/share/nginx/html`).
> For a clean rebuild: `docker compose down -v && docker compose up --build`.

### Without Docker

```bash
# Backend
cd backend
cp .env.example .env
# Ensure REDIS_HOST & REDIS_PORT (or REDIS_URL) are set in .env
npm install
npx prisma generate
npx prisma db push
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

### Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@company.com | Admin123! |
| ITSupport | support@company.com | Support123! |

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
| POST | `/api/tickets` | Create ticket |
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
| POST | `/api/tickets/:ticketId/attachments` | Upload file |
| GET | `/api/tickets/:ticketId/attachments` | List attachments |
| GET | `/api/attachments/:id/download` | Download file |

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

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | DB + Redis status |

## Frontend Pages

| Route | Page | Access |
|-------|------|--------|
| `/login` | Login form | Public |
| `/tickets` | Ticket list (own/all) | Authenticated |
| `/tickets/new` | Create ticket form | ITSupport, Admin |
| `/tickets/:id` | Ticket detail + comments | Authenticated |
| `/dashboard` | Statistics & charts | ITSupport, Admin |
| `/notifications` | In-app notifications | Authenticated |
| `/my-account` | Profile info (change password for Admin/ITSupport only) | Authenticated |
| `/admin/users` | User management | Admin |
| `/admin/master-data` | Categories, SLA configs | Admin |

## API Response Format

```json
// Success
{ "data": ..., "meta": { "page": 1, "limit": 20, "total": 150 } }

// Error
{ "error": { "code": "TICKET_NOT_FOUND", "message": "Ticket not found" } }
```

## Docker Services

| Service | Image / Build | Port | Healthcheck |
|---------|---------------|------|-------------|
| frontend | `frontend/Dockerfile` (target: builder) | — | — | Builds frontend via `tsc && vite build`, copies `/app/dist` to shared volume `frontend_dist`, stays idle with `tail -f /dev/null` |
| nginx | nginx:1.25-alpine | 80 | — |
| api | backend/Dockerfile (node:20-bookworm-slim) | 3000 | `GET /api/health` |
| db | postgres:16-alpine | — | `pg_isready` |
| cache | redis:7-alpine | — | `redis-cli ping` |

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

## Scaling

See [ARCHITECTURE.md](./ARCHITECTURE.md#4-scaling-suggestions) for detailed scaling guide:

1. Stateless API — ready for horizontal scaling (HPA)
2. File upload — switch to S3/GCS via `StorageService` interface
3. Cron job — extract to Kubernetes CronJob
4. Database — managed PostgreSQL with read replicas
5. Redis — managed, separate instances for tokens vs cache
6. CDN — serve frontend from CloudFront/Cloudflare
7. CI/CD — GitHub Actions → registry → Kubernetes
