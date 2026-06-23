# IT Support Ticketing

## Stack
Backend: NestJS + Prisma + PostgreSQL + Redis
Frontend: React 18 + Vite + TanStack Query + Zustand + Tailwind

## Struktur Kunci
```
backend/src/{auth,tickets,comments,attachments,categories,sub-categories,dashboard,users,sla,notifications,telegram,health}
frontend/src/{pages(10),components/{auth,layout,tickets,dashboard,admin,ui},hooks,stores,types,lib}
```

## Perintah
```bash
cd backend && npm test          # Unit test (14 tests)
cd backend && npm run build     # NestJS build
cd frontend && npm run build    # tsc + vite build
cd frontend && npm run lint     # ESLint zero warnings
docker compose up --build       # localhost:80 (frontend di-build otomatis via Docker)
docker compose down -v          # Hapus container + volume (frontend_dist, db, dll)
```

## Seed Credentials
- admin@company.com / Admin123!
- support@company.com / Support123!

## API Base
```
GET  /api/health
POST /api/auth/login|refresh|logout|change-password
GET|POST /api/tickets
GET /api/tickets/export/csv           # ITSupport & Admin only
GET|PATCH|DELETE /api/tickets/:id
PATCH /api/tickets/:id/status|assign|priority
GET|POST /api/tickets/:id/comments|attachments
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
- Bot polling via `TelegramService.pollLoop()` (non-blocking setTimeout loop)
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

## Docker Build Flow
- `frontend` service: build dari `frontend/Dockerfile` (target `builder`) — `npm ci && npm run build` baked ke image, runtime copy `/app/dist` ke shared volume `frontend_dist`, lalu `tail -f /dev/null` (running).
- `nginx` service: baca static files dari `frontend_dist:/usr/share/nginx/html`.
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
- `JWT_SECRET` dan `DATABASE_URL` wajib diset — startup throw error jika tidak ada
- `JWT_SECRET` tidak boleh menggunakan fallback hardcoded; generate unik per-install
- `TELEGRAM_BOT_TOKEN` opsional — fallback jika token belum disimpan di DB config

### Telegram
- Backend: module `telegram/` — service (polling bot, kirim pesan), controller (link, config CRUD), listener (event-driven)
- Backend: `TelegramConfig` model — botToken, settings (enabledEvents, enableGroupChat, groupChatId, templates) disimpan di DB
- Frontend: MyAccount — Link/Unlink Telegram (Admin only), Bot Settings (token, group chat, event checkboxes, template editor)
- Event: `ticket.created` tambah field `priority` & `requesterEmail` di payload
- Test Notification: tombol di My Account (Admin) — kirim test message sesuai settingan (group/individual), validasi real-time dari Telegram API
- Check Config: tombol "Check" di Bot Settings — validasi bot token (via `getMe`) + group chat ID (via `getChat`) real-time dari Telegram API, menampilkan status inline (✅/❌)
- Keamanan: bot token tidak pernah dikirim ke frontend (hanya flag `hasBotToken: true`)

## Changelog

### Docker
- Build: ganti bind mount `./frontend/dist` → named volume `frontend_dist` + frontend builder service (fix 403)
- Build: tambah `COPY postcss.config.js` & `COPY tailwind.config.js` ke Dockerfile (fix Tailwind tidak terproses)
- Build: hapus `COPY public ./public` (direktori tidak ada)
- Container: frontend service pakai `exec tail -f /dev/null` biar stay running (tidak exit code 0)
- Seed: compile `seed.ts` ke JS otomatis di startup, `upsert` update password tiap restart
- Redis: support `REDIS_URL` (ioredis) sebagai fallback `REDIS_HOST`/`REDIS_PORT`
- .env.example: tambah `REDIS_HOST` & `REDIS_PORT`

### Tickets
- Status: tambah `OnHold` ke frontend (type, color, badge, statusFlows)
- Status Flows: samakan dengan backend (`Closed → Open`, `InProgress → OnHold/Resolved`)
- Status: clear `closedAt`/`resolvedAt` saat reopen ticket
- Priority: dropdown editable di tabel Tickets (ITSupport/Admin)
- Category: kolom baru di tabel Tickets
- Number: format `TKT-XXX` (sequential, tanpa YYMM)
- Delete: tambah tombol Delete (Admin only) + ConfirmDialog di detail & list
- Kolom Created By, Assigned To dropdown di list (ITSupport/Admin)

### Frontend UI/UX
- Dark Mode: `tailwind darkMode: 'class'`, theme-store zustand persist, toggle di sidebar
- Sidebar: minimize/expand (collapsed state, icon-only mode)
- Sidebar: New Ticket tidak ikut nge-highlight menu Tickets (NavLink `end` prop)
- PasswordInput: reusable dengan eye icon (hold to reveal)
- Waktu: formatDateTime jadi 24H (HH:mm)
- Notifikasi: dropdown toggle di Navbar + Mark all as read
- Notifikasi: counter auto-fetch via `useNotifications()` di Layout
- ErrorBoundary: wrapping App + route `/notifications`

### Users & Auth
- Role: Change Password hanya untuk Admin & ITSupport
- Role: Dashboard & New Ticket hide untuk EndUser
- Users: ITSupport bisa GET `/users` (assign dropdown)
- Users: `includeInactive=true` — user tetap terlihat setelah di-deactivate
- Users: hard-delete dengan transaction (FK error → "Deactivate the user instead")
- ValidationPipe: UpdateUserDto tambah field `isActive` (fix forbidden non-whitelisted)
- Auth: fix admin login gagal — password hash terupdate tiap restart

### Dashboard
- SLA Compliance: fix literal `\n` di tooltip
- Ticket Trend: tampilkan "No activity" jika semua count 0
- Auto-refresh setelah ticket status/priority/assign berubah
- Category resolution: fix typo `avgMinutes` → `avgResolutionMinutes`

### Master Data
- Categories/Sub-categories: reactivate soft-deleted record saat create dengan nama sama
- Cross-invalidation categories ↔ subcategories
- Fix URL sub-categories: tambah `categoryId` di path update/delete
- Toast error handling di Master Data

### Comments — File Upload
- Backend: `POST /tickets/:ticketId/comments` kini menerima multipart/form-data dengan field `content`, `type`, dan `files` (max 3 file, 5MB each, allowed MIME types)
- Backend: `commentId` (optional) ditambahkan ke model Attachment — file terupload di link ke comment
- Frontend: CommentSection — tambah tombol "Attach files" dengan file list + remove, thumbnail preview untuk gambar
- Frontend: comment card — tampilkan attachment list dengan thumbnail preview (image) & tombol Download, modal full-size preview untuk gambar
- Prisma: `db push` untuk menambahkan kolom `commentId` + index

### Filter
- Assigned to Me: filter by current user ID (sebelumnya tidak berfungsi)
- Date Range: ganti 2 date picker terpisah jadi dropdown preset (All Time, Today, Last 7 Days, Last 30 Days, This Month, Custom) — hemat tempat
- Attachment upload: max 3 files, max 5MB each (New Ticket)

### Security
- Env: `validateEnv()` di startup — throw jika `JWT_SECRET`/`DATABASE_URL` tidak diset
- JWT: hapus hardcoded `'super-secret-key'` fallback di 3 file (auth.module, jwt.strategy, auth.service)
- WebSocket: validasi JWT via `jwtService.verify()` di handshake gateway (S-2)
- Auth: refresh token pindah ke httpOnly cookie (`secure`, `sameSite: strict`, path `/api/auth`)
- Auth: access token hanya di memory (zustand tanpa persist) — tidak ada token di localStorage
- Auth: silent refresh otomatis di `ProtectedRoute` saat page reload
- Ticket: `findById` filter untuk EndUser — hanya bisa lihat ticket milik sendiri (S-4)
- SLA: `performSLACheck()` pakai batch pagination 500/trip (P-1)

### Post-Code-Review Fix
- Fix: `useTicketAuditTrail` dihapus (B-1) tapi `TicketDetail.tsx` masih import & pakai — ganti ke `ticket.histories`
- Fix: Tambah `histories`, `comments`, `attachments` ke `Ticket` interface (types/index.ts)
- Fix: `frontend/node_modules` & `frontend/dist` ownership root (dari Docker) — `rm -rf` & reinstall

### Export CSV
- Backend: `GET /api/tickets/export/csv` (ITSupport/Admin only) — download CSV dengan filter yang sama seperti list
- Frontend: Tombol "Export CSV" di header TicketsPage (ITSupport/Admin)
- CSV headers: Ticket #, Subject, Status, Priority, Category, Sub Category, Created By, Assigned To, Created At, Resolved At, SLA Status

### Notifications
- Backend: `DELETE /api/notifications` — hapus semua notifikasi user
- Frontend: Tombol "Clear all" di NotificationsPage & dropdown Navbar

### Theme
- Dark Mode: `tailwind darkMode: 'class'`, theme-store zustand persist
- Theme switcher: Light/Dark ada di profile dropdown Navbar

### Users & Auth
- My Account: halaman `/my-account` untuk semua role, berisi profil & change password
- Change Password: pindah dari sidebar ke halaman My Account (bukan route terpisah)
- Profile dropdown: Navbar — avatar user, My Account, theme toggle, Logout

### Login
- Bug: axios interceptor ikut nge-handle 401 dari `/auth/login` dan nyoba refresh token — error asli "Invalid email or password" ketelan
- Fix: tambah pengecualian `/auth/login` di axios interceptor
- Fix: tambah `toast.error()` di `useLogin` hook biar error muncul sebagai toast

### Dashboard
- Avg Resolution Time: unit cerdas — tampilkan jam (`≥60m`), menit (`≥1m`), atau detik (`<1m`) sesuai nilai

### Date Filter
- Date range: dropdown preset (All Time, Today, Last 7 Days, Last 30 Days, This Month, Custom)
- Input date muncul hanya saat pilih Custom
- Backend: `dateTo` di-set ke 23:59:59.999 UTC agar ticket yang dibuat setelah tengah malam tetap terfilter
- Custom: start date `max` dibatasi end date, end date `min` dibatasi start date

### Sorting
- Backend `GET /api/tickets`: tambah sort fields `ticketNumber`, `subject`, `status` ke whitelist (`allowedSortFields`)
- Frontend: column headers Ticket #, Subject, Status, Priority, Created jadi clickable sort — toggle asc/desc
- Sort indicator (arrow icon) pada active sort column, semi-transparent panah pada inactive column
- Sort state (`sortBy`/`sortOrder`) di `FilterValues`, berubah via `onFiltersChange` → reset page ke 1
- Backend `sortBy` whitelist: `createdAt`, `updatedAt`, `slaDueAt`, `priority`, `ticketNumber`, `subject`, `status`

### Telegram — Test Notification
- Backend: tambah `POST /api/telegram/test-notification` (Admin only) + `sendTestNotification()` method
- Backend: `sendTestNotification()` membaca settings (groupChat/individual) — kirim sesuai preferensi
- Backend: group chat failure tidak blocking — fallback ke individual, error dilaporkan sebagai partial failure
- Backend: validasi real-time dari Telegram API — throw `BadRequestException` jika gagal (token tidak dikonfigurasi, akun tidak link, atau error dari Telegram)
- Frontend: tombol "Test Notification" di My Account (Admin) — muncul hanya saat Telegram sudah link
- Frontend: toast success/error — menampilkan pesan error asli dari backend/Telegram API
- Fix: `sendTestNotification` tidak throw partial failure jika group chat gagal tapi individual berhasil — cukup return success + server-side log
- Fix: `updateConfig` support clear bot token (kirim `""` → hapus dari DB, fallback ke env var)

### Telegram — Check Config
- Backend: tambah `POST /api/telegram/check` (Admin only) + `checkConfig()` method
- Backend: `checkConfig()` validasi bot token via `getMe` API + group chat ID via `getChat` API
- Frontend: tombol "Check" di Bot Settings — validasi real-time, tampilkan status inline ✅/❌
- Frontend: validasi Group Chat ID — "Save Settings" disable + pesan error jika group chat di-enable tapi ID kosong
