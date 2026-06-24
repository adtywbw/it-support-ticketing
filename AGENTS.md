# IT Support Ticketing

## Stack
- Backend: NestJS + Prisma + PostgreSQL + Redis
- Frontend: React 18 + Vite + TanStack Query + Zustand + Tailwind

## Current State
- Backend memakai repository pattern (`common/repositories/`); service baru sebaiknya inject repository, bukan `PrismaService` langsung.
- Auth: access token memory-only di Zustand; refresh token httpOnly cookie path `/api/auth`, disimpan/revoke lewat Redis.
- API error response distandarkan oleh `HttpExceptionFilter`: `{ error: { code, message } }`.
- Frontend memakai top-level `auth/`, `layout/`, `pages/`, `components/`, `hooks/`, `stores/`, `types`, dan `lib`.
- Server state frontend memakai TanStack Query; client state memakai Zustand untuk theme/auth/notification count dan React state untuk form/UI lokal.
- Docker production flow memakai frontend builder service + named volume `frontend_dist`, nginx untuk static files, dan API di belakang nginx.
- Telegram config disimpan di DB dengan fallback `.env TELEGRAM_BOT_TOKEN`; bot token tidak dikirim ke frontend.

## Active Work
- `AGENTS.md` adalah project memory ringkas yang harus dibaca dulu sebelum mengerjakan task.
- Detail riwayat perubahan ada di `CHANGELOG.md`; baca hanya jika butuh konteks historis, alasan keputusan lama, atau konteks regression.
- Saat mengerjakan task baru, batasi eksplorasi ke scope user dan file terkait agar hemat token.
- Jika user memberi scope spesifik, jangan melebar ke backend/frontend lain kecuali ada indikasi root cause di sana.

## Do Not Do
- Jangan simpan access token di `localStorage` atau storage persisten lain.
- Jangan tambahkan fallback hardcoded untuk `JWT_SECRET`, `DATABASE_URL`, atau `REDIS_URL`.
- Jangan bypass repository pattern dengan inject `PrismaService` langsung di service baru.
- Jangan buka akses EndUser ke Dashboard, `/admin` routes, atau ticket milik user lain.
- Jangan tampilkan attachment/comment internal ke EndUser.
- Jangan kirim Telegram bot token ke frontend; frontend hanya boleh menerima flag seperti `hasBotToken`.
- Jangan menjalankan `docker compose down -v` kecuali diminta eksplisit karena menghapus DB/volume.
- Jangan revert, reset, atau ubah perubahan user tanpa instruksi eksplisit.
- Jangan ubah flow Docker/HTTPS kecuali diminta; cek bagian Docker & HTTPS dulu karena riwayatnya pernah berubah.

## Task Workflow
- Baca scope user dulu; jangan eksplorasi melebar.
- Untuk bug frontend, mulai dari page/hook/component terkait sebelum cek backend.
- Untuk bug API, mulai dari controller/service/repository terkait.
- Untuk perubahan backend, ikuti controller → service → repository.
- Run verifikasi yang relevan saja; jangan build/test seluruh stack kecuali perlu.
- Jangan baca `CHANGELOG.md` kecuali butuh konteks historis atau alasan keputusan lama.

## Commands
```bash
cd backend && npm test          # Unit tests
cd backend && npm run build     # NestJS build
cd frontend && npm run build    # tsc + vite build
cd frontend && npm run lint     # ESLint zero warnings
docker compose up --build       # Build & start semua service
docker compose up -d            # Start tanpa build / setelah build spesifik
docker compose build api        # Build backend saja
docker compose build frontend   # Build frontend saja
./scripts/backup.sh             # Backup DB PostgreSQL + uploads volume ke backups/<timestamp>/
docker compose logs -f frontend # Debug frontend build
docker compose logs -f api      # Debug backend
docker compose logs -f nginx    # Debug nginx (403, 404, dll)
docker compose down -v          # Hapus container + volume; hanya jika diminta eksplisit
docker image prune -f           # Hapus dangling images
```

## Structure
```
backend/src/{auth,tickets,comments,attachments,categories,sub-categories,dashboard,users,sla,notifications,telegram,maintenance,health}
backend/src/common/repositories/{user,ticket,comment,attachment,category,sub-category,sla-config,notification,telegram-config}.repository.ts
frontend/src/{auth,layout,pages,components,hooks,stores,types,lib}
```

## Dev Seed Credentials
- admin@company.com / Admin123!
- support@company.com / Support123!

## Role & Access
| Role | Dashboard | New Ticket | My Account | Users | Master Data | Maintenance |
|------|-----------|------------|------------|-------|-------------|-------------|
| EndUser | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ |
| ITSupport | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Constraints
- EndUser hanya bisa lihat ticket sendiri dan close own resolved ticket (`Resolved → Closed`).
- EndUser bisa create ticket sendiri, tapi tidak bisa comment/upload/list attachment untuk ticket user lain.
- Attachment/comment internal tidak pernah dikirim ke EndUser.
- Access token memory-only; tidak ada token di `localStorage`.
- Refresh token httpOnly cookie path `/api/auth`; pastikan setting `secure` sesuai environment agar local HTTP tetap bisa auth.
- WebSocket disconnect jika user dinonaktifkan (cek `isActive` di DB).
- Password hash bcrypt cost 12, di-update tiap restart via seed `upsert`.

## Auth & Security
- `JWT_SECRET`, `DATABASE_URL`, dan `REDIS_URL` wajib diset; startup throw error jika kosong.
- `JWT_SECRET` tidak boleh memakai fallback hardcoded; generate unik per install.
- `CORS_ORIGIN` daftar origin yang diizinkan (dipisah koma), default `https://helpdesk.rsmch.internal`.
- `DATABASE_POOL_MAX` max koneksi pool Prisma ke PostgreSQL, default 10.
- Logout revoke refresh token Redis (`refresh:{sub}:{jti}`).
- Non-HTTP exception tidak membocorkan internal message ke client.

## API Summary
```
GET  /api/health
POST /api/auth/login|refresh|logout|change-password
GET|POST /api/tickets                 # POST authenticated users; EndUser creates own ticket
GET /api/tickets/export/csv           # ITSupport/Admin only
GET|PATCH|DELETE /api/tickets/:id
PATCH /api/tickets/:id/status|assign|priority
GET|POST /api/tickets/:id/comments|attachments  # EndUser hanya own ticket; internal hidden
GET|POST|PATCH|DELETE /api/categories
GET|POST|PATCH|DELETE /api/categories/:categoryId/sub-categories
PATCH|DELETE /api/sub-categories/:id  # deprecated, use full path
GET|POST|PATCH /api/sla-configs
GET /api/dashboard/stats
GET|POST|PATCH|DELETE /api/users      # GET ?includeInactive=true untuk inactive users
GET|PATCH|DELETE /api/notifications   # DELETE clear all, PATCH read-all/:id/read
GET|POST|DELETE|PUT|POST /api/telegram # status, link, unlink, config, test-notification, check
GET|POST /api/maintenance/backups       # Admin only; list/create backup
DELETE /api/maintenance/backups/:id      # Admin only; delete backup folder
POST /api/maintenance/backups/:id/restore # Admin only; full restore DB + uploads
GET /api/maintenance/backups/:id/download/db|uploads  # Admin only
```

## Telegram
- Backend module `telegram/`: service (polling bot, kirim pesan), controller (link, config CRUD), listener (event-driven).
- Bot polling via `TelegramService.pollLoop()` non-blocking setTimeout loop, 30s long-poll timeout, idle delay 30s.
- Config disimpan di model `TelegramConfig`: botToken, enabledEvents, templates, enableGroupChat, groupChatId.
- Bot token fallback: DB config → `.env TELEGRAM_BOT_TOKEN`.
- Notifikasi dikirim ke grup jika `enableGroupChat=true` + ke semua user ITSupport/Admin yang link.
- Event listener: `ticket.created`, `ticket.assigned`, `ticket.status.updated`.
- Frontend My Account: Link/Unlink Telegram (Admin only), Bot Settings, Test Notification, Check Config.
- Template variable: `{ticketNumber}`, `{subject}`, `{priority}`, `{createdBy}`, `{oldStatus}`, `{newStatus}`, `{assignedBy}`, `{url}`.
- Bot token tidak pernah dikirim ke frontend; frontend hanya menerima flag seperti `hasBotToken`.

## Docker & HTTPS
- HTTP only (no SSL/TLS). Nginx listens on port 80. HTTPS disabled untuk local development.
- Domain: `helpdesk.rsmch.internal` (resolve via AdGuard Home DNS Rewrite).
- Cert files: `nginx/certs/` gitignored; placeholder jika SSL diaktifkan lagi.
- Untuk re-enable SSL: uncomment SSL server block di `nginx.conf`, expose port 443 di `docker-compose.yml`, generate cert via `mkcert`.
- `frontend` service build dari `frontend/Dockerfile` target `builder`; runtime copy `/app/dist` ke shared volume `frontend_dist`, lalu stay running.
- `nginx` service baca static files dari `frontend_dist:/usr/share/nginx/html`.
- `api` service port `3000` bind ke `127.0.0.1` untuk debug lokal; traffic normal lewat nginx `/api/`.
- Backup operasional: jalankan `./scripts/backup.sh` saat Compose services up; output `backups/<timestamp>/{db.sql.gz,uploads.tar.gz,manifest.txt}` dan folder `backups/` gitignored.
- Admin UI Maintenance: `/admin/maintenance` bisa create/list/download/delete/restore backup; restore penuh DB + uploads, wajib typed confirmation, dan membuat pre-restore backup otomatis.
- Backup UI: tombol `DB` download `db.sql.gz` (dump PostgreSQL), tombol `Uploads` download `uploads.tar.gz` (attachment files).
- API image memasang `postgresql-client-16`, `gzip`, `tar`, `gosu`; entrypoint chown `/app/uploads` dan `/app/backups`, lalu menjalankan app sebagai user `node`.
- Untuk rebuild semua service: `docker compose up --build`.

## Convention
- Backend: service → repository → controller, DTO validation via `class-validator` (`whitelist` + `forbidNonWhitelisted`). Maintenance module boleh pakai filesystem/child process untuk operasi backup, tetap Admin-only.
- Frontend: functional components + hooks, named exports (no default), Tailwind utility classes.
- File naming: `kebab-case` files, `PascalCase` components/classes, `camelCase` variables/functions.
- Error: throw `BadRequestException`/`NotFoundException` on backend, `toast.error()` on frontend.
- No CSS modules or styled-components; Tailwind only.
- Import: `@/` alias for frontend, relative paths for backend within module.

## State Management
- Zustand persist: theme (dark/light) in localStorage.
- Zustand no persist: auth (user, accessToken memory-only), notification count.
- TanStack Query: tickets, users, categories, notifications, dashboard stats.
- React state: form input and component-local UI state.

## Models
User, Ticket, Comment, Attachment, Category, SubCategory, SLAConfig, TicketHistory, Notification, TelegramConfig
- Ticket → User (requesterId, assignedToId), Category, SubCategory.
- Comment → Ticket + User.
- Attachment → Ticket + User + optional Comment.
- SLAConfig unique on `(categoryId, priority)`.

## File Placement
- Pages: `frontend/src/pages/`.
- Components: `frontend/src/components/{domain}/` (tickets, dashboard, admin, ui).
- Hooks: `frontend/src/hooks/` for TanStack Query hooks.
- Stores: `frontend/src/stores/` for Zustand.
- Types: `frontend/src/types/`.
- Lib: `frontend/src/lib/` for axios client and utils.
- Backend module: `backend/src/{module}/` with `module.ts`, `controller.ts`, `service.ts`, `dto/`.
- Backend repositories: `backend/src/common/repositories/`.

## API Response
- Success: `{ data, meta? }`; meta berisi `{ page, limit, total }` untuk paginated.
- Error: `{ error: { code, message } }`; global `HttpExceptionFilter` applies to all endpoints.

## Changelog
Detail histori ada di `CHANGELOG.md`. Baca hanya jika butuh alasan keputusan lama atau konteks regression.
