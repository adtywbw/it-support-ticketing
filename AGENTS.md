# IT Support Ticketing

## Stack
Backend: NestJS + Prisma + PostgreSQL + Redis
Frontend: React 18 + Vite + TanStack Query + Zustand + Tailwind

## Struktur Kunci
```
backend/src/{auth,tickets,comments,attachments,categories,sub-categories,dashboard,users,sla,notifications,telegram,health}
backend/src/common/repositories/{user,ticket,comment,attachment,category,sub-category,sla-config,notification,telegram-config}.repository.ts
frontend/src/{auth(2),layout(3),pages(9),components/{tickets,dashboard,admin,ui},hooks,stores,types,lib}
```

## Perintah
```bash
cd backend && npm test          # Unit test (14 tests)
cd backend && npm run build     # NestJS build
cd frontend && npm run build    # tsc + vite build
cd frontend && npm run lint     # ESLint zero warnings
docker compose up --build       # Build & start semua service
docker compose up -d            # Start tanpa build (pakai image yang sudah ada)
docker compose build api        # Build backend aja
docker compose build frontend   # Build frontend aja
docker compose up -d            # Start setelah build spesifik
docker compose down -v          # Hapus container + volume (frontend_dist, db, dll)
docker image prune -f           # Hapus dangling images
```

## Seed Credentials
- admin@company.com / Admin123!
- support@company.com / Support123!

## API Base
```
GET  /api/health
POST /api/auth/login|refresh|logout|change-password
GET|POST /api/tickets                 # POST ITSupport & Admin only
GET /api/tickets/export/csv           # ITSupport & Admin only
GET|PATCH|DELETE /api/tickets/:id
PATCH /api/tickets/:id/status|assign|priority
GET|POST /api/tickets/:id/comments|attachments  # EndUser hanya own ticket; internal attachments disembunyikan
GET|POST|PATCH|DELETE /api/categories
GET|POST|PATCH|DELETE /api/categories/:categoryId/sub-categories
PATCH|DELETE /api/sub-categories/:id     # (deprecated, use full path)
GET|POST|PATCH /api/sla-configs
GET /api/dashboard/stats
GET|POST|PATCH|DELETE /api/users      # GET ?includeInactive=true untuk lihat inactive users
GET|PATCH|DELETE /api/notifications   # DELETE clear all, PATCH read-all/:id/read
GET|POST|DELETE|PUT|POST /api/telegram     # status, link, unlink, config, test-notification, check (Admin only)
```

## Telegram
- Bot polling via `TelegramService.pollLoop()` (non-blocking setTimeout loop, 30s long-poll timeout, idle delay 30s)
- Config disimpan di model `TelegramConfig` — botToken, enabledEvents, templates, enableGroupChat, groupChatId
- Notifikasi dikirim ke grup (jika enableGroupChat=true) + ke semua user ITSupport/Admin yang link
- Event listener: `ticket.created`, `ticket.assigned`, `ticket.status.updated`
- Template bisa diedit via Admin UI (My Account) — variable: `{ticketNumber}`, `{subject}`, `{priority}`, `{createdBy}`, `{oldStatus}`, `{newStatus}`, `{assignedBy}`, `{url}`
- Bot token fallback: DB config → `.env TELEGRAM_BOT_TOKEN`

## Frontend Routes
```
/login, /tickets, /tickets/new, /tickets/:id
/dashboard, /notifications, /my-account
/admin/users, /admin/master-data
```

## Role & Access
| Role | Dashboard | New Ticket | My Account | Users | Master Data |
|------|-----------|------------|------------|-------|-------------|
| EndUser | ✗ | ✗ | ✓ | ✗ | ✗ |
| ITSupport | ✓ | ✓ | ✓ | ✗ | ✗ |
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ |

## HTTPS
HTTP only (no SSL/TLS). Nginx listens on port 80. HTTPS was disabled to simplify local development.
- Domain: `helpdesk.rsmch.internal` (resolve via AdGuard Home DNS Rewrite)
- Cert files: `nginx/certs/` (gitignored) — placeholder if SSL is re-enabled
- To re-enable SSL: uncomment SSL server block in `nginx.conf`, expose port 443 in `docker-compose.yml`, generate certs via `mkcert`

## Docker Build Flow
- `frontend` service: build dari `frontend/Dockerfile` (target `builder`) — `npm ci && npm run build` baked ke image, runtime copy `/app/dist` ke shared volume `frontend_dist`, lalu `tail -f /dev/null` (running).
- `nginx` service: baca static files dari `frontend_dist:/usr/share/nginx/html`.
- `api` service: port `3000` hanya bind ke `127.0.0.1` untuk debug lokal; traffic aplikasi normal lewat nginx `/api/`.
- `depends_on: - frontend` (short form) — nginx mulai setelah frontend container running (copy sudah selesai karena cepet).
- Untuk rebuild: `docker compose up --build`.

## Perintah Penting
```bash
docker compose up --build        # Build & start semua service
docker compose down -v           # Stop + hapus semua volume (frontend_dist, db, dll)
docker compose logs -f frontend  # Debug frontend build
docker compose logs -f api       # Debug backend
docker compose logs -f nginx     # Debug nginx (403, 404, dll)
```

## Env Requirements
- `JWT_SECRET`, `DATABASE_URL`, dan `REDIS_URL` wajib diset — startup throw error jika tidak ada
- `JWT_SECRET` tidak boleh menggunakan fallback hardcoded; generate unik per-install
- `CORS_ORIGIN` — daftar origin yang diizinkan (dipisah koma), default `https://helpdesk.rsmch.internal`
- `DATABASE_POOL_MAX` — max koneksi pool Prisma ke PostgreSQL, default 10
- `TELEGRAM_BOT_TOKEN` opsional — fallback jika token belum disimpan di DB config

## Current State
- Backend sudah memakai repository pattern (`common/repositories/`) dan service baru sebaiknya inject repository, bukan `PrismaService` langsung.
- Auth: access token memory-only di Zustand, refresh token httpOnly cookie path `/api/auth`, token refresh disimpan/revoke lewat Redis.
- API error response distandarkan oleh `HttpExceptionFilter`: `{ error: { code, message } }`.
- Frontend sudah direstruktur ke top-level `auth/`, `layout/`, `pages/`, `components/`, `hooks/`, `stores/`, `types`, dan `lib`.
- Server state frontend memakai TanStack Query; client state memakai Zustand untuk theme/auth/notification count dan React state untuk form/UI lokal.
- Docker production flow memakai frontend builder service + named volume `frontend_dist`, nginx untuk static files, dan API di belakang nginx.
- Telegram config disimpan di DB dengan fallback `.env TELEGRAM_BOT_TOKEN`; bot token tidak dikirim ke frontend.

## Active Work
- `AGENTS.md` adalah project memory ringkas yang harus dibaca dulu sebelum mengerjakan task.
- Detail riwayat perubahan ada di `CHANGELOG.md`; baca hanya jika butuh konteks historis atau alasan keputusan lama.
- Saat mengerjakan task baru, batasi eksplorasi ke scope user dan file terkait agar hemat token.
- Jika user memberi scope spesifik, jangan melebar ke backend/frontend lain kecuali ada indikasi root cause di sana.

## Do Not Do
- Jangan simpan access token di `localStorage` atau storage persisten lain.
- Jangan tambahkan fallback hardcoded untuk `JWT_SECRET`, `DATABASE_URL`, atau `REDIS_URL`.
- Jangan bypass repository pattern dengan inject `PrismaService` langsung di service baru.
- Jangan buka akses EndUser ke Dashboard, New Ticket, `/admin` routes, atau ticket milik user lain.
- Jangan tampilkan attachment/comment internal ke EndUser.
- Jangan kirim Telegram bot token ke frontend; frontend hanya boleh menerima flag seperti `hasBotToken`.
- Jangan revert, reset, atau ubah perubahan user tanpa instruksi eksplisit.
- Jangan ubah flow Docker/HTTPS kecuali diminta; cek bagian HTTPS dan Docker Build Flow dulu karena riwayatnya pernah berubah.

### Telegram
- Backend: module `telegram/` — service (polling bot, kirim pesan), controller (link, config CRUD), listener (event-driven)
- Backend: `TelegramConfig` model — botToken, settings (enabledEvents, enableGroupChat, groupChatId, templates) disimpan di DB
- Frontend: MyAccount — Link/Unlink Telegram (Admin only), Bot Settings (token, group chat, event checkboxes, template editor)
- Event: `ticket.created` tambah field `priority` & `requesterEmail` di payload
- Test Notification: tombol di My Account (Admin) — kirim test message sesuai settingan (group/individual), validasi real-time dari Telegram API
- Check Config: tombol "Check" di Bot Settings — validasi bot token (via `getMe`) + group chat ID (via `getChat`) real-time dari Telegram API, menampilkan status inline (✅/❌)
- Keamanan: bot token tidak pernah dikirim ke frontend (hanya flag `hasBotToken: true`)

## Convention
- Backend: service → repository → controller, DTO validation via `class-validator` (`whitelist` + `forbidNonWhitelisted`)
- Frontend: functional components + hooks, named exports (no default), Tailwind utility classes
- File naming: `kebab-case` for files, `PascalCase` for components/classes, `camelCase` for variables/functions
- Error: throw `BadRequestException`/`NotFoundException` on backend, `toast.error()` on frontend
- No CSS modules or styled-components — Tailwind only
- Import: `@/` alias for frontend, relative paths for backend within module

## State
- **Zustand (persist)**: theme (dark/light) — localStorage
- **Zustand (no persist)**: auth (user, accessToken memory-only), notification count
- **TanStack Query**: tickets, users, categories, notifications, dashboard stats — semua server state (cache + refetch)
- **React state**: form input (`useState`/`useReducer`), component-local UI state

## Models
User, Ticket, Comment, Attachment, Category, SubCategory, SLAConfig, TicketHistory, Notification, TelegramConfig
- Ticket → User (requesterId, assignedToId), Ticket → Category/SubCategory
- Comment → Ticket + User, Attachment → Ticket + User + Comment (optional)
- SLAConfig unique on (categoryId, priority)

## Constraints
- **EndUser**: hanya bisa lihat & close own resolved ticket (`Resolved → Closed`) — ownership + role dicek di service
- **EndUser**: tidak bisa create ticket/comment/upload/list attachment untuk ticket user lain; attachment dari internal comment tidak pernah dikirim ke EndUser
- **Access token**: memory only (zustand tanpa persist) — tidak ada token di localStorage
- **Refresh token**: httpOnly cookie (`secure`, `sameSite: strict`, path `/api/auth`), disimpan di Redis dan revoke saat logout
- **JWT_SECRET**: no hardcoded fallback — throw error jika tidak di `.env`
- **docker compose down -v**: hapus DB + volume → seed ulang otomatis
- **EndUser**: no Dashboard, no New Ticket, no /admin routes
- **WebSocket**: disconnect jika user dinonaktifkan (cek `isActive` di DB)
- **Password hash**: bcrypt cost 12, di-update tiap restart via seed `upsert`

## API Response
- Success: `{ data, meta? }` — meta berisi `{ page, limit, total }` untuk paginated
- Error: `{ error: { code, message } }` — global `HttpExceptionFilter` applies to all endpoints

## File Placement
- Pages: `frontend/src/pages/`
- Components: `frontend/src/components/{domain}/` (tickets, dashboard, admin, ui)
- Hooks: `frontend/src/hooks/` — TanStack Query hooks
- Stores: `frontend/src/stores/` — Zustand
- Types: `frontend/src/types/`
- Lib: `frontend/src/lib/` — axios client, utils
- Backend module: `backend/src/{module}/` — `module.ts`, `controller.ts`, `service.ts`, `dto/`
- Backend repositories: `backend/src/common/repositories/`

## Changelog
Detail riwayat perubahan dipindahkan ke `CHANGELOG.md` agar project memory ini tetap ringkas.

Ringkasan keputusan terbaru:
- Security hardening mencakup httpOnly refresh cookie, memory-only access token, inactive user checks, ownership checks, dan error sanitization.
- Backend service memakai repository pattern melalui `common/repositories/`.
- Docker production flow memakai `npm ci`, non-root user, healthcheck, logging limit, dan API bind ke `127.0.0.1:3000`.
- Frontend sudah direstruktur ke top-level `auth/` dan `layout/`, dengan TanStack Query untuk server state.
- Ticket, comment, attachment, notification, CSV export, dashboard, Telegram, dan master data punya detail hardening/fix historis di `CHANGELOG.md`.
