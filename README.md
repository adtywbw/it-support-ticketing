# IT Support Ticketing System

Full-stack ticketing application for internal IT support, built with **NestJS**, **React 18**, **PostgreSQL**, **Redis**, and **Docker**.

## Architecture

Browser → Nginx (port 80 dev / 443 prod via override, reverse proxy + static files) → NestJS API (port 3000) → PostgreSQL 16 + Redis 7. A separate frontend builder service compiles the React SPA via Vite and copies the output to a shared named volume (`frontend_dist`) that Nginx serves.

See [ARCHITECTURE.md §1](./ARCHITECTURE.md#1-architecture-overview) for the container diagram and stack justification.

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
- Export CSV with current filters (ITSupport & Admin), filename: `tickets-YYYY-MM-DD.csv`

### SLA Management
- Configurable SLA per category + priority
- `slaDueAt` and `slaStatus` auto-calculated on ticket creation (nullable when no SLA config matches)
- Partial updates validate merged `responseTimeMinutes`/`resolutionTimeMinutes` (resolution must be ≥ response)
- Auto-recalculation of affected open tickets when SLA timing is created or changed
- Background cron every 5 minutes checks SLA breach (Redis lock for horizontal scaling)
- SLA status: `OnTrack`, `AtRisk` (≤20% remaining), `Breached`
- Admin UI: **SLA Configuration** tab in Master Data for CRUD by category/priority with human-readable time inputs (minutes/hours/days)

### Dashboard & Statistics
- Current operational snapshot: active tickets, open, in progress, SLA risk, and unassigned
- Need Attention lists: SLA Risk, Critical/High Priority, and Unassigned tickets with direct links to ticket detail
- Historical analytics with 7d / 30d / 90d / custom range filter
- Ticket trend, status/priority distribution, SLA compliance rate, top categories, and average resolution time per category
- Redis-cached (30s TTL, `dashboard:stats:v2:<range>`) with event-driven invalidation on ticket create/status/assign/priority/delete

### Notifications
- In-app notification system (table-based)
- Dropdown toggle in navbar with recent notifications
- Mark all as read & Clear all from dropdown and full page
- Click notification → navigate to ticket
- Triggers: new ticket, status change, assignment, priority change, new comment
- Requester also notified on ticket creation and status updates (if not ITSupport/Admin)
- **Notification Preferences**: users choose which in-app notification types appear in their notification panel. Toggle set scoped by role (EndUser: `ticket.created`, `ticket.status.updated`, `ticket.priority.updated`; ITSupport/Admin: all four — add `ticket.assigned`). Default all ON; `null`/absent = enabled. Filter applied at creation — unread count and WebSocket gateway unchanged.
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
- **Maintenance Mode**: Admin must enable maintenance mode first before backup/restore buttons become active. During maintenance, Admin can navigate all menus (small non-blocking banner shown); non-admin users see a full-screen overlay and cannot interact with the system. Restore auto-enables maintenance mode for the entire duration (typically 15-60 seconds), then auto-disables when complete.

### UI/UX
- Dark mode toggle (persisted to localStorage, default light)
- Sidebar minimize/expand with icon-only mode
- Password show/hide toggle button (eye icon on all password fields)
- Responsive mobile layout with hamburger menu
- Blue Operations visual theme: royal-blue primary actions, navy/blue-black dark mode surfaces, blue-tinted light mode surfaces, and polished `SH` brand mark
- Login page uses an Enterprise Portal / Support Assist layout with compact sign-in form, support cards, and FAQ panel

### Security
- **CSRF protection** via `X-Requested-With` custom header check on all state-changing requests (enforced by `CsrfGuard`, registered as first global guard)
- **Device fingerprint** binding for refresh tokens (SHA-256 of User-Agent + client IP) — stolen tokens revoked on fingerprint mismatch
- JWT auth (access in-memory + refresh httpOnly cookie), bcrypt cost 12, account lockout, role-based access control
- EndUser ownership-scoped: own tickets/comments/attachments only; internal comments/attachments hidden
- File upload: extension whitelist, magic-byte MIME validation (with Office container compatibility), path traversal prevention, size limits
- WebSocket sessions bounded to access-token expiry; inactive users disconnected
- DTO validation: trim + `@IsNotEmpty()` + `@MinLength()` rejects whitespace-only payloads
- `MaintenanceGuard` blocks non-admin API during maintenance; Admin bypasses via JWT verification
- See [ARCHITECTURE.md §7](./ARCHITECTURE.md#7-security-architecture) for full security architecture

### Observability
- **Structured JSON logging** — every log line is JSON with `timestamp`, `level`, `correlationId`, `context`, and `message`; production logs only `log`/`error`/`warn`
- **Request correlation** — `RequestIdMiddleware` generates/propagates `X-Request-ID` header, stored in `AsyncLocalStorage` so all logs from the same request share a correlation ID
- See [ARCHITECTURE.md §8](./ARCHITECTURE.md#8-observability) for logging infrastructure

### Accessibility (a11y)
- **Automated tests** — 7 `jest-axe` tests on LoginPage, TicketsPage, Pagination, LoadingSpinner, EmptyState, ErrorMessage, ConfirmDialog
- **Heading order compliance** — semantic heading levels enforced (`h1` page title → `h2` section → `h3` sub-section)

## Project Structure

```
it-support-ticketing/
├── docker-compose.yml         # Multi-container setup (dev: HTTP)
├── docker-compose.prod.yml    # Production override (mkcert TLS: port 443)
├── scripts/                   # backup.sh
├── nginx/                     # reverse proxy + security headers
├── backend/                   # NestJS API (Prisma, Redis, WebSocket)
├── frontend/                  # React SPA (Vite, TanStack Query, Zustand, Tailwind)
└── uploads/                   # File attachments volume
```

See [ARCHITECTURE.md §4 Folder Structure](./ARCHITECTURE.md#4-folder-structure) for the full file-level tree.

## Database Schema

11 tables with proper indexes and foreign keys (users, tickets, comments, attachments, categories, sub_categories, locations, sla_configs, ticket_history, notifications, telegram_config).

See [ARCHITECTURE.md §3 Database Schema](./ARCHITECTURE.md#3-database-schema-erd-textual) for the full ERD with fields, indexes, and relationships.

## Quick Start

### Prerequisites
- Docker & Docker Compose v2
- Git

### Setup

```bash
# 1. Clone and enter
git clone <repo-url> && cd it-support-ticketing

# 2. Environment variables for Docker Compose
#    backend/.env        -> `api` service (full set, canonical source)
#    backend/.env.db     -> `db` service (PostgreSQL only, least-privilege)
#    backend/.env.cache  -> `cache` service (Redis only, least-privilege)
cp backend/.env.compose.example backend/.env
cp backend/.env.db.example       backend/.env.db
cp backend/.env.cache.example    backend/.env.cache
# Edit secrets in backend/.env: JWT_SECRET, POSTGRES_PASSWORD, DATABASE_URL,
# REDIS_PASSWORD, and REDIS_URL. backend/.env is the canonical source for the
# API service and backup.sh when running via docker compose.
# Then set the SAME POSTGRES_PASSWORD in backend/.env.db and the SAME
# REDIS_PASSWORD in backend/.env.cache (they must match backend/.env so the
# API can connect to the DB and Redis).
# Wajib: JWT_SECRET, DATABASE_URL, REDIS_URL, dan REDIS_PASSWORD harus diset.
# Telegram: TELEGRAM_BOT_TOKEN opsional (bisa diisi via Admin UI nanti)
#
# The example ships with local HTTP defaults (NODE_ENV=development,
# COOKIE_SECURE=false) matching the bundled HTTP-only nginx config.
# For production behind an HTTPS reverse proxy, set NODE_ENV=production,
# COOKIE_SECURE=true, and CORS_ORIGIN to your HTTPS origin.

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
> - Expose API directly for local debugging: `docker compose -f docker-compose.yml -f docker-compose.debug.yml up -d api`

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

### Pre-Commit Hooks

Staged TypeScript files are automatically linted via `husky` + `lint-staged`: `eslint --fix` runs on `backend/src/**/*.ts` and `frontend/src/**/*.{ts,tsx}` before each commit. Install hooks with `npx husky install` (runs automatically via `npm install`).

### Seed Data

The seed script creates:
- **Admin** user: `admin@company.com` / `Admin123!`
- **IT Support** user: `support@company.com` / `Support123!`
- 2 categories (Hardware, Software) with SLA configs
- 1 sample ticket
- Locations can be added via Master Data (Admin) or seed script

Production containers do not run seed automatically. If the seed script is run manually in production, `SEED_ADMIN_PASSWORD` and `SEED_SUPPORT_PASSWORD` are required and the default admin/support passwords are updated to those values. The sample ticket is skipped when `NODE_ENV=production`.

**Production seed**: requires `SEED_ADMIN_PASSWORD` and `SEED_SUPPORT_PASSWORD` environment variables. If either is missing, seed throws an error. Production credentials are never logged to stdout.

### Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@company.com | Admin123! |
| ITSupport | support@company.com | Support123! |

> **Production**: Default credentials above are for development only. In production, set `SEED_ADMIN_PASSWORD` and `SEED_SUPPORT_PASSWORD` env vars before running seed.

## Production Deployment

The Quick Start section covers local HTTP development. Production requires HTTPS, strong secrets, and explicit seed credentials. Follow the steps below in addition to the Quick Start setup.

### Prerequisites

- **TLS termination** — either an external reverse proxy (nginx, Caddy, Traefik, Cloudflare, ALB) in front of the bundled nginx, or mkcert-issued certificates for an internal network. See [TLS Options](#tls-options) below.
- **Strong secrets** — generate with `openssl rand -hex 24` (passwords, URL-safe for `DATABASE_URL`/`REDIS_URL`) or `openssl rand -hex 32` (JWT). Avoid `-base64` for passwords: its `/`, `+`, `=` characters are reserved in URIs and break connection strings unless URL-encoded.
- **Seed passwords** — `SEED_ADMIN_PASSWORD` and `SEED_SUPPORT_PASSWORD` for first-run seeding.

### 1. Configure Environment

In `backend/.env`, switch from the local HTTP defaults to production values:

```env
NODE_ENV=production
COOKIE_SECURE=true
CORS_ORIGIN=https://helpdesk.rsmch.internal

# Strong secrets (do not reuse dev values)
JWT_SECRET=<32+ random characters — validated at startup>
POSTGRES_PASSWORD=<strong-db-password>
REDIS_PASSWORD=<strong-redis-password — required in production>
DATABASE_URL=postgresql://ticketing:<strong-db-password>@db:5432/ticketing
REDIS_URL=redis://:<strong-redis-password>@cache:6379

# Seed credentials (required for production seed)
SEED_ADMIN_PASSWORD=<strong-admin-password>
SEED_SUPPORT_PASSWORD=<strong-support-password>

# Optional: auto-seed on container start (otherwise run seed manually once)
SEED_ON_START=true
```

Ensure the matching passwords in the least-privilege env files:
- `backend/.env.db` → `POSTGRES_PASSWORD` must match `backend/.env`
- `backend/.env.cache` → `REDIS_PASSWORD` must match `backend/.env`

> **Enforced at startup.** The API refuses to start unless `JWT_SECRET` is set and ≥32 characters (validated in `jwt.config.ts` regardless of `NODE_ENV`). When `NODE_ENV=production`, `REDIS_PASSWORD` must also be set and `COOKIE_SECURE=true`.

### 2. TLS Options

The bundled nginx listens on port 80 (HTTP only). Secure cookies require HTTPS, so TLS must be terminated somewhere. Choose one:

#### Option A — External Reverse Proxy (recommended)

Put a TLS-terminating proxy (nginx, Caddy, Traefik, AWS ALB, Cloudflare) in front. The bundled nginx stays HTTP and receives proxied traffic. No changes to `nginx.conf` or `docker-compose.yml` are needed — just set `COOKIE_SECURE=true` and `CORS_ORIGIN` to your HTTPS origin.

If you add an upstream proxy, configure the bundled nginx to trust only that proxy's IP/subnet before relying on `X-Forwarded-For` headers (see note in Quick Start).

#### Option B — mkcert (internal networks)

For internal deployments where you control the client devices, enable SSL directly in the bundled nginx using [mkcert](https://github.com/FiloSottile/mkcert):

```bash
# 1. Install mkcert and its local CA
mkcert -install

# 2. Generate certificates for your domain
mkdir -p nginx/certs
mkcert -cert-file nginx/certs/helpdesk.rsmch.internal.pem \
       -key-file nginx/certs/helpdesk.rsmch.internal-key.pem \
       helpdesk.rsmch.internal
```

> **Non-default domains:** `nginx/nginx.ssl.conf` currently uses `server_name helpdesk.rsmch.internal` and certificate filenames `helpdesk.rsmch.internal.pem` / `helpdesk.rsmch.internal-key.pem`. If you deploy a different domain, update `server_name` and the `ssl_certificate` / `ssl_certificate_key` paths or create certificate files with the expected names. Also set `CORS_ORIGIN` in `backend/.env` to the same HTTPS origin.

The repo ships `nginx/nginx.ssl.conf` and `docker-compose.prod.yml`. The production override swaps the HTTP nginx config for the SSL variant (port 80 → 301 redirect, 443 with TLS) and mounts the certs directory. The default SSL config targets `helpdesk.rsmch.internal`; use the non-default domain note above before deploying another hostname.

1. **DNS** — point `helpdesk.rsmch.internal` to your server (e.g., via AdGuard Home, dnsmasq, or `/etc/hosts`).

2. **Build and start** with the production override:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
   ```

> **Trust:** mkcert certificates are trusted only by machines that have the mkcert root CA installed. Run `mkcert -CAROOT` to find the root CA and distribute it to client devices. For larger deployments, use a public CA (Let's Encrypt) or an internal PKI.
>
> **Certificate renewal:** mkcert certificates expire after ~2.5 years. When the cert nears expiry, regenerate it with the same `mkcert -cert-file ...` command from step 2, then restart nginx to pick up the new cert:
> ```bash
> docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
> ```
> Client devices do **not** need to reinstall the CA — the root CA remains valid for ~10 years.

### 3. Build and Start

```bash
# Option A (external reverse proxy) or local HTTP dev:
docker compose up --build -d

# Option B (mkcert, bundled nginx with TLS):
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

> **Tip (Option B):** To avoid repeating `-f` flags, set `COMPOSE_FILE` once:
> `export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml`
> Then `docker compose up`, `docker compose ps`, etc. use both files automatically.

The API entrypoint runs `prisma migrate deploy` (3 retries) on startup. In production, the seed script runs automatically only if `SEED_ON_START=true`; otherwise run it manually once:

```bash
docker compose exec api node dist/prisma/seed.js
```

> In production, the seed script **rotates** existing admin/support passwords on each run (unlike dev mode which preserves them). The sample ticket is skipped and credentials are never logged to stdout.

### 4. Verify

```bash
# Health check (includes DB, Redis, and maintenance status)
curl http://helpdesk.rsmch.internal/api/health
# Note: use http:// for local dev (default compose), https:// for production (with docker-compose.prod.yml)

# Container status
docker compose ps
```

Log in with the admin credentials you set via `SEED_ADMIN_PASSWORD`. Change the password from **My Account** if desired.

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login — sets refresh token as httpOnly cookie, returns `accessToken` + `user` |
| POST | `/api/auth/refresh` | Refresh access token — reads refresh token from cookie (no body needed); returns `accessToken` + `user` on success, `401` with `UNAUTHORIZED` code when no cookie |
| POST | `/api/auth/logout` | Invalidate refresh token + clear cookie |
| POST | `/api/auth/change-password` | Change own password (ITSupport & Admin only; EndUser cannot change own password) |

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
| GET | `/api/notifications/unread-count` | Get unread notification count |
| GET | `/api/notifications/preferences` | Get notification preferences (per-role normalized) |
| PATCH | `/api/notifications/preferences` | Update notification preferences |
| PATCH | `/api/notifications/:id/read` | Mark as read |
| PATCH | `/api/notifications/read-all` | Mark all as read |
| DELETE | `/api/notifications` | Clear all notifications |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List (ITSupport & Admin, `?includeInactive=true` for all) |
| GET | `/api/users/:id` | Get user by ID (ITSupport & Admin) |
| GET | `/api/users/assignable` | List users eligible for ticket assignment |
| POST/PATCH/DELETE | `/api/users/:id` | Create / Update / Hard-delete (Admin only) |
| GET/POST | `/api/categories` | List / Create categories |
| PATCH/DELETE | `/api/categories/:id` | Update / Delete category |
| GET/POST | `/api/categories/:id/sub-categories` | List / Create sub-categories |
| PATCH/DELETE | `/api/categories/:categoryId/sub-categories/:id` | Update / Delete sub-category |
|| GET/POST/PATCH/DELETE | `/api/locations` | List / Create / Update / Delete locations (Admin write; role-based read) |
|| GET/POST | `/api/sla-configs` | List / Create SLA configs |
|| PATCH | `/api/sla-configs/:id` | Update SLA config |
|| GET | `/api/audit-logs` | List audit logs (Admin only; paginated, filterable by action/entity/userId) |
|| GET/POST | `/api/maintenance/backups` | List / Create operational backups (Admin only) |
| DELETE | `/api/maintenance/backups/:id` | Delete an operational backup folder (Admin only) |
| POST | `/api/maintenance/backups/:id/restore` | Full restore database + uploads from a backup (Admin only; auto maintenance mode) |
| GET | `/api/maintenance/backups/:id/download/db` | Download database backup (Admin only) |
| GET | `/api/maintenance/backups/:id/download/uploads` | Download uploads backup (Admin only) |
| GET | `/api/maintenance/mode` | Get maintenance mode status (Public) |
| PATCH | `/api/maintenance/mode` | Toggle maintenance mode on/off (Admin only) |

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard/stats?range=7d\|30d\|90d\|custom&from=YYYY-MM-DD&to=YYYY-MM-DD` | Dashboard `{ current, attention, analytics }` stats (ITSupport/Admin) |

### Telegram
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/telegram/status` | Check if current user is linked |
| POST | `/api/telegram/link` | Generate link code (8-char, 5 min expiry) |
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
| `/dashboard` | Current snapshot, attention lists, and range-filtered analytics | ITSupport, Admin |
| `/notifications` | In-app notifications | Authenticated |
| `/my-account` | Profile info, self-service password change, notification preferences | Authenticated |
| `/admin/users` | User management | Admin |
| `/admin/master-data` | Categories, Sub-categories, Locations, SLA configs, FAQ | Admin |
| `/admin/maintenance` | Backup create/list/download/delete/restore + restore instructions | Admin |

## API Response Format

All success responses are wrapped in `{ data, meta? }` envelope by `TransformInterceptor` (global). Stream/CSV/blob responses are excluded. DELETE endpoints returning `void` produce `{ data: null }`.

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
| frontend | `frontend/Dockerfile` (target: builder) | — | unless-stopped | — | 10m x 3 files; hardened: `mem_limit: 1g`, `cpus: 2`, `cap_drop: ALL`, `read_only` |
| nginx | nginx:1.25-alpine | 80 (dev) / 443 (prod override) | unless-stopped | — | 10m x 3 files |
| api | `backend/Dockerfile` (node:20-bookworm-slim, non-root via entrypoint) | internal 3000; host 127.0.0.1:3000 only with `docker-compose.debug.yml` | unless-stopped | `GET /health` (30s) | 10m x 3 files |
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

Manual backups acquire `maintenance:backup:lock` in Redis and renew it every 120 seconds while running. The lock is token-matched on renew/release so concurrent backup/restore operations cannot take over each other's lock. Backup artifacts are written with restrictive permissions (`chmod 600` for files; backup directory `chmod 700`).

> **Note:** Redis is not included in backups. After a restore, refresh tokens and cache are lost — all users must log in again.

`backups/` is gitignored. Store backup copies outside the server as part of production operations.

Admins can also create, list, download, delete, and restore backups from `/admin/maintenance`. The UI creates the same `db.sql.gz`, `uploads.tar.gz`, and `manifest.txt` set under `backups/<timestamp>/`. Restore is destructive, requires typed backup ID confirmation, creates a fresh pre-restore backup automatically, and requires login again after success. Admin must enable maintenance mode before backup/restore buttons become active in the UI.

The API image installs `postgresql-client-16` to match the PostgreSQL 16 server. Its entrypoint fixes ownership of mounted `/app/uploads` and `/app/backups`, then drops privileges so the NestJS process still runs as `node`.

## Testing & Lint

```bash
# Backend unit tests
cd backend
npm run test

# Backend E2E tests (requires docker compose up -d)
# Production stack (HTTPS with docker-compose.prod.yml):
cd backend
E2E_HOST=helpdesk.rsmch.internal E2E_PORT=443 E2E_PROTOCOL=https npm run test:e2e
# Isolated stack (HTTP, separate DB/Redis, port 3001):
docker compose -f docker-compose.e2e.yml up -d --build
E2E_HOST=localhost E2E_PORT=3001 E2E_PROTOCOL=http npm run test:e2e
# Note: maintenance mode E2E tests include a 200ms delay before PATCH to
# stay within nginx's 10r/s rate-limit window after ~10 rapid requests.

# Frontend tests + lint (zero warnings policy)
cd frontend
npm test
npm run lint
```

Backend unit tests (757 tests, 72 suites):
- `TicketsService` — create, findAll, updateStatus (atomic conditional update → 409 on race)
- `AuthService` / `AuthController` — login, refresh, lockout, token rotation, device fingerprint
- `AttachmentVisibilityPolicy` — EndUser/ITSupport/Admin visibility boundaries
- `MaintenanceService` / `MaintenanceGuard` — backup/restore failure paths, admin bypass, Redis fail-open
- `SLAService` — partial update merged-value validation, not-found, isActive-only patches, cron lock release, auto-recalculation on create/timing update
- `MIME validation` — magic-byte detection, Office file compatibility (OOXML/OLE2), spoofing rejection, text null-byte check
- `NotificationsGateway` — token validation, token-expiry disconnect scheduling, timer cleanup
- `HealthController` — healthy/unhealthy checks, maintenance status, Redis/DB failure isolation
- All 15 controllers — 100% coverage (auth, tickets, comments, attachments, categories, sub-categories, sla, dashboard, users, notifications, telegram, maintenance, health, faqs, audit-logs)
- All 18 services — 100% coverage (auth, tickets, comments, attachments, categories, sub-categories, sla, dashboard, users, notifications, telegram, maintenance, faqs, redis, prisma, audit-logs)
- All 26 DTOs — 96% validation coverage
- All 10 repositories — safe select + pagination + where-clause correctness

Frontend tests (213 tests, 44 suites):
- Component render tests: Pagination (11 tests), StatusBadge (5), PriorityBadge (4), Switch (12), Table (14), PasswordInput (7)
- All hooks tested: useSocket, useNotifications, useDashboard, useSLA, useChangePassword, useCategories
- All stores tested: auth-store
- All pages tested: Login, Tickets, TicketDetail, Dashboard, CreateTicket, Notifications, MyAccount, Admin (Users, MasterData, Maintenance)
- Utilities tested: sla-time, theme colors, app-initializers, global styles
- E2E smoke test (15 tests) — health → login → categories → create location → create ticket → update status → comment → dashboard → delete → refresh 401 → maintenance mode (enable, health check, exempt path, disable)

## Scaling

See [ARCHITECTURE.md](./ARCHITECTURE.md#6-scaling-suggestions) for detailed scaling guide:

1. Stateless API — ready for horizontal scaling (HPA)
2. File upload — switch to S3/GCS via `StorageService` interface
3. Cron job — extract to Kubernetes CronJob
4. Database — managed PostgreSQL with read replicas
5. Redis — managed, separate instances for tokens vs cache
6. CDN — serve frontend from CloudFront/Cloudflare
7. CI/CD — GitHub Actions → registry → Kubernetes

## Security

This project implements defense-in-depth security measures. See [ARCHITECTURE.md §7 Security Architecture](./ARCHITECTURE.md#7-security-architecture) for the full security architecture (auth, file upload, infrastructure).

### Security Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes (min 32 chars) | JWT signing secret |
| `COOKIE_SECURE` | Yes in production | `true` for HTTPS, `false` for local HTTP dev (enforced `true` when `NODE_ENV=production`; `.env.compose.example` ships `false` for bundled HTTP-only nginx) |
| `REDIS_PASSWORD` | Yes in production | Redis authentication |
| `REDIS_TLS` | No | Set `true` for Redis over TLS |
| `SEED_ON_START` | No | Set `true` to auto-seed in production (requires `SEED_ADMIN_PASSWORD`/`SEED_SUPPORT_PASSWORD`) |
| `DATABASE_POOL_MAX` | No (default 10) | Prisma connection pool size; recommended 20 for production |

### Container Image Pinning

Dockerfiles and Compose files currently use maintained upstream tags such as `node:20-bookworm-slim`, `nginx:1.25-alpine`, `postgres:16-alpine`, and `redis:7-alpine`. For stricter production supply-chain control, pin these images to reviewed digests and update them through a controlled dependency-update process. Do not hand-edit guessed digests; generate and review digest updates with the deployment team.

### CI/CD
GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every PR and push to main:
- **Backend**: `npm ci` → `npm run lint` → `npm run build` → `npm test` (with PostgreSQL + Redis service containers)
- **Frontend**: `npm ci` → `npm run lint` → `npm run build` → `npx vitest run`
