# IT Support Ticketing

## Purpose
- Compact project memory for agents; read before starting work.
- If this file conflicts with current code, trust the code and mention/update this file when relevant.
- Read `CHANGELOG.md` only for regression context, old decisions, or historical reasons.

## Stack Snapshot
- Backend: NestJS 10, Prisma 5, PostgreSQL 16, Redis 7, Socket.IO notifications.
- Frontend: React 18, Vite 5, TanStack Query 5, Zustand, Tailwind.
- API success: `{ data, meta? }` (enforced globally via `TransformInterceptor`); paginated `meta` is `{ page, limit, total, totalPages? }`.
- API error: `{ error: { code, message } }` via `HttpExceptionFilter` (stable codes: `BAD_REQUEST`, `NOT_FOUND`, `MAINTENANCE`, etc.).

## Work Style
- Stay inside the user's scope; if a path/page/endpoint is named, start there.
- Frontend bug: page -> related hook/component -> API/backend only if evidence points there.
- API bug: controller -> service -> repository.
- Backend change: keep service -> repository flow; new services inject repositories, not `PrismaService`.
- Verify narrowly with relevant test/build/lint only; do not run the whole stack unless needed.
- Preserve user changes; never revert/reset/checkout files without explicit request.

## Agentic Loop Wajib
- Fase 1 - Context Gathering: gunakan Project Structure dan API Map di AGENTS.md sebagai peta awal — jangan recursive scan direktori dulu. Lookup langsung ke file spesifik yang relevan dengan task. Jika file tidak ditemukan dari lookup terarah, baru scan direktori terbatas. Baca maksimal 3-5 file sebelum pindah ke Planning.
- Jangan langsung edit file sebelum context gathering selesai.
- Fase 2 - Planning: untuk task yang menyentuh lebih dari 1 file, tulis rencana perubahan sebelum eksekusi.
- Planning format (compact): `path/to/file.ts` → apa yang diubah (1 kalimat). Untuk bug: root cause 1 kalimat. Flag jika ada behavior change. Jangan verbose — planning harus terbaca dalam 30 detik.
- Untuk bug, identifikasi root cause terlebih dahulu, baru susun plan fix.
- Tanya konfirmasi manusia HANYA jika informasi yang dibutuhkan tidak bisa diderivasi dari codebase atau AGENTS.md ini. Maksimal 1 pertanyaan per siklus; gabung semua ambiguitas dalam satu pesan.
- Fase 3 - Execution: buat perubahan sesempit mungkin sesuai scope task.
- Jangan tambah fitur, refactor, atau improvement yang tidak diminta.
- Prefer reversible actions dan hindari operasi destruktif tanpa konfirmasi eksplisit.
- Jika diminta commit, satu perubahan logis = satu commit; jangan batch perubahan tidak terkait.
- Fase 4 - Verification: setelah edit, jalankan test/lint/build yang relevan sesuai area perubahan.
- Jika verifikasi tidak relevan atau tidak bisa dijalankan, laporkan alasannya.
- Jika test/lint/build gagal, baca error, analisis, perbaiki, lalu ulangi verifikasi.
- Jangan deklarasikan selesai sebelum verifikasi relevan hijau atau keterbatasannya dijelaskan.
- Fase 5 - Reporting: ringkas file yang diubah, alasan perubahan, verifikasi yang dijalankan, dan bukti verifikasi yang berhasil.
- Flag perubahan behavior secara eksplisit jika ada yang perlu diketahui manusia.

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
| Frontend tests | `frontend` | `vitest` |
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
backend/src/common/policies/attachment-visibility.policy.ts
frontend/src/{auth,layout,pages,components,hooks,stores,types,lib}
```

## File Placement & Conventions
- Backend module files live in `backend/src/{module}/` with `module.ts`, `controller.ts`, `service.ts`, and `dto/`.
- Backend repositories live in `backend/src/common/repositories/`.
- Backend policies live in `backend/src/common/policies/` (e.g., `AttachmentVisibilityPolicy`).
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
- Access token has `tokenType: 'access'` claim; refresh token has `tokenType: 'refresh'`.
- Refresh token is an httpOnly cookie with path `/api/auth`; revoke via Redis key `refresh:{sub}:{jti}`.
- Logout is cookie-based (no access token required); always clears refresh cookie and revokes Redis key.
- Cookie `secure` defaults to `x-forwarded-proto` check; override with `COOKIE_SECURE=true/false` env.
- `JWT_SECRET`, `DATABASE_URL`, and `REDIS_URL` are required at startup; production requires min 32-char `JWT_SECRET` and `REDIS_PASSWORD`.
- `CORS_ORIGIN` is comma-separated. Code currently defaults to `https://helpdesk.rsmch.internal`; Docker local is HTTP-only, so set env explicitly when using an HTTP origin.
- Non-HTTP exceptions must not leak internal messages to clients.
- Password hash cost is bcrypt 12; seed uses `upsert` on restart.
- WebSocket clients disconnect when user is inactive (`isActive=false`).
- Upload filenames are generated server-side (`uuid + safe extension`); `originalName` stored in DB for display only.
- Telegram config API response strips `groupChatId`; only `hasBotToken`/`hasGroupChatId` flags returned to frontend.

## Roles & Access
| Role | Dashboard | New Ticket | My Account | Users | Master Data | Maintenance |
|------|-----------|------------|------------|-------|-------------|-------------|
| EndUser | No | Yes | Yes | No | No | No |
| ITSupport | Yes | Yes | Yes | No | No | No |
| Admin | Yes | Yes | Yes | Yes | Yes | Yes |

## Ticket Rules
- EndUser can create own tickets, view only own tickets, and close own `Resolved -> Closed` tickets.
- EndUser cannot comment, upload, or list attachments for tickets owned by another user.
- Internal comments and internal attachments are never returned/displayed to EndUser.
- Attachment visibility is centralized via `AttachmentVisibilityPolicy` in `backend/src/common/policies/`.
- EndUser sees only PUBLIC direct attachments and attachments from PUBLIC comments.
- ITSupport/Admin can access dashboard and operational ticket workflows.

## Maintenance Mode
- Flags live in Redis: `maintenance:enabled`, `maintenance:message`; Redis is not restored from backups.
- `MaintenanceGuard` is a global guard in `app.module.ts` and runs before `ThrottlerGuard`.
- Always allowed during maintenance: `/api/health`, `/api/maintenance/*`, `/api/auth/*`.
- Non-admin API calls during maintenance return `503 { error: { code: 'MAINTENANCE', message } }`.
- Use `@SkipMaintenance()` to skip checks on specific handlers.
- `restoreBackup()` enables maintenance, drains for 5 seconds before `DROP SCHEMA`, then disables it after restore only if restore succeeded.
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
- **Lockfile compatibility**: after running `npm install` or `npm update` locally, regenerate lockfiles with the Docker node version to prevent `npm ci` failures: `docker run --rm -v "$(pwd)/frontend":/app -w /app node:20-alpine npm install --package-lock-only` and `docker run --rm -v "$(pwd)/backend":/app -w /app node:20-bookworm-slim npm install --package-lock-only`.
- `frontend` service builds `frontend/Dockerfile` target `builder`, copies `/app/dist` to `frontend_dist`, then stays running.
- `nginx` serves static files from `frontend_dist:/usr/share/nginx/html` and proxies API traffic.
- `nginx` also proxies `/socket.io/` with WebSocket upgrade headers for realtime notifications.
- `api` binds port `3000` to `127.0.0.1` for local debug; normal traffic goes through nginx `/api/`.
- `api`, `db`, and `cache` services read from `backend/.env` via `env_file`; `cache` requires `REDIS_PASSWORD` and starts Redis with `requirepass`.
- Backup output lives in `backups/<timestamp>/{db.sql.gz,uploads.tar.gz,manifest.txt}` and `backups/` is gitignored.
- `db.sql.gz` covers public schema tables; Redis is not backed up.
- Admin UI `/admin/maintenance` can create/list/download/delete/restore backups with typed confirmation and pre-restore backup.
- API image includes `postgresql-client-16`, `gzip`, `tar`, and `gosu`; entrypoint chowns `/app/uploads` and `/app/backups`, then runs as `node`.
- Redis has no persistence volume. Refresh tokens and maintenance flags are lost on `cache` container recreate. This is an intentional tradeoff: logout massal on Redis restart is acceptable for this deployment.

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
- Attachment relates to ticket, user, optional comment, and has `visibility` (`PUBLIC`/`INTERNAL`).
- `SLAConfig` is unique on `(categoryId, priority)`.
- `TelegramConfig` is singleton enforced by `key` column (`@unique @default("default")`); repository uses `findOrCreate()` on the fixed key.

## Key Model Fields (anti-hallucination)
- `Ticket`: `ticketNumber` (dari sequence, bukan MAX), `status`, `priority`, `visibility` tidak ada di model Ticket — visibility ada di `Attachment`.
- `Attachment`: `visibility: PUBLIC | INTERNAL`, `originalName` (untuk display saja), nama file di disk = uuid + safe extension.
- `Comment`: tidak ada field `isInternal` — visibility internal dikontrol via `Attachment.visibility` dan `AttachmentVisibilityPolicy`.
- `TelegramConfig`: singleton, selalu diakses via `key = "default"`, gunakan `findOrCreate()` dari repository — jangan `findFirst()` atau `create()` langsung.
- `Notification`: clear-all, read-all, mark-read didukung API — cek API Map sebelum tambah endpoint baru.
- `SLAConfig`: unique constraint di `(categoryId, priority)` — upsert saat create/update.

## Common Pitfalls
- Jangan inject `PrismaService` langsung ke service baru; selalu lewat repository di `common/repositories/`.
- `TransformInterceptor` sudah wrap response jadi `{ data, meta? }` secara global — jangan wrap manual di controller.
- `AttachmentVisibilityPolicy` adalah satu-satunya sumber kebenaran visibility attachment — jangan duplikasi logic filter di tempat lain.
- Frontend error: gunakan `toast.error()`, bukan `throw` atau `console.error` saja.
- Backend error: gunakan `BadRequestException` / `NotFoundException` dari `@nestjs/common`, bukan `Error` biasa.
- Jangan buat subcategory endpoint terpisah untuk list; derivasikan dari data categories yang sudah ada (lihat MasterData di Performance Optimizations).
- Telegram: jangan kirim `botToken` atau `groupChatId` ke frontend — hanya flag `hasBotToken` / `hasGroupChatId`.

## Dev Seed Credentials
- `admin@company.com / Admin123!`
- `support@company.com / Support123!`
- Production seed requires `SEED_ADMIN_PASSWORD` and `SEED_SUPPORT_PASSWORD` env vars.

## Performance Optimizations (CODE_REVIEW.md Sesi 2)
- Ticket number: PostgreSQL sequence `ticket_number_seq` — O(1) `nextval()`, bukan `MAX(SUBSTRING)` full scan. Transaction isolation default (bukan Serializable).
- SLA cron: keyset pagination `id > lastId` (bukan offset `skip: processed`).
- EndUser ticket list: batch aggregate count via `$queryRaw` — bukan N+1 per-ticket.
- Dashboard: Redis cache TTL 30 detik + SQL aggregation untuk SLA stats & daily trends.
- Database indexes: 15+ indexes ditambah di migration `20260626001000_add_perf_indexes`, termasuk `pg_trgm` GIN indexes untuk ILIKE search.
- MaintenanceGuard: in-memory cache 2 detik + `mget` — kurangi Redis round-trip per request.
- LocalStorage: async `fs/promises` (bukan sync blocking).
- Notifications/Telegram: concurrency limit 3-5 via `runWithConcurrency`.
- Frontend: route-level `React.lazy()` code splitting, nginx static asset immutable cache, TanStack Query staleTime tuning (categories 30m, assignable 10m).
- MasterData: subcategories derived from categories data (no N+1 requests).
- RedisService: tambah `mget()` method untuk multi-key get atomik.

## Bug Fixes (CODE_REVIEW.md Sesi 3)
- **Restore safety**: maintenance tetap enabled saat restore gagal; pre-restore backup ID di-return ke error message.
- **Docker env**: `backend/.env.compose.example` (canonical, termasuk `REDIS_PASSWORD`), `backend/.env.local.example` (local dev).
- **Attachment visibility**: EndUser `findMany`/`count` pakai `AttachmentVisibilityPolicy.buildVisibleAttachmentWhere()` — post-query filter dihapus.
- **WebSocket refresh**: `useSocket()` re-create socket saat `accessToken` berubah via Zustand selector.
- **Upload atomic**: direct attachment & comment creation pakai Prisma transaction; file cleanup jika DB insert gagal.
- **Status race**: `updateStatus()` pakai conditional `updateMany({ where: { id, status: oldStatus } })` + 409 Conflict.
- **User deactivation**: emit `user.deactivated` → revoke refresh tokens + disconnect sockets.
- **Category EndUser**: `GET /categories` return minimal fields untuk EndUser (`findForTicketForm`); Admin tetap lengkap.
- **Telegram polling**: generation counter + timeout handle — stale loops auto-stop.
- **Backup script**: refuse saat maintenance off; flag `--live-ok` untuk live backup.
- **Pagination DTO**: `PaginationQueryDto` dengan `@Type(Number)`, `@IsInt`, `@Min(1)`, `@Max(100)`.
- **Telegram config**: typed DTOs (`UpdateTelegramConfigDto`, `CheckTelegramConfigDto`) + event whitelist validation.
- **SLA errors**: category existence precheck + Prisma P2002/P2025 → Conflict/NotFound.
- **Frontend toasts**: semua mutation/export/download failure sekarang `toast.error()`.
- **Pagination clamp**: `TicketList`, `AttachmentList`, `CommentSection` auto-adjust page saat totalPages menyusut.
- **VITE_API_URL**: axios `baseURL`, refresh, socket sekarang gunakan `import.meta.env.VITE_API_URL || '/api'`.
- **Redis healthcheck**: `REDISCLI_AUTH` env (bukan `-a`); config file via `umask 077`.
- **Nginx**: hapus `set_real_ip_from` private ranges + `real_ip_header`.
- **Login redirect**: respect `location.state.from` dari `ProtectedRoute`.
- **Notification count**: invalidate `notifications-unread-count` query setelah mark-read.
- **Telegram subject**: `ticket.assigned` event include `subject: ticket.subject`.
- **Thumbnail cache**: LRU limit 100 entries + revoke evicted URLs.
- **DTO trim**: `@Transform(trimString)` + `@IsNotEmpty()` + `@MaxLength()` di category, subcategory, user DTOs.
