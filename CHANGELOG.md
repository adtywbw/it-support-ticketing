# Changelog

Riwayat perubahan project yang dipindahkan dari `AGENTS.md` agar project memory tetap ringkas.

## Performance (CODE_REVIEW.md Ses 2)
- **PERF-01**: Tambah database indexes untuk query panas — `categoryId`, `subCategoryId`, `slaStatus`, `updatedAt`, `requesterId+createdAt`, `assignedToId+status`, `status+slaStatus` pada tickets; `ticketId+createdAt`, `userId` pada comments; `ticketId+visibility`, `userId` pada attachments; `userId+isRead+createdAt` pada notifications; `ticketId+createdAt` pada ticket_history; `createdAt` pada users.
- **PERF-02**: Migration raw SQL untuk `pg_trgm` extension + 5 GIN trigram indexes untuk search ILIKE pada tickets (subject, description, ticketNumber) dan users (name, email).
- **PERF-03**: Hilangkan N+1 query pada EndUser ticket list — ganti `for..await` per-ticket count dengan batch aggregate via `$queryRaw` (`countPublicCommentsByTicketIds`, `countVisibleAttachmentsByTicketIds`).
- **PERF-04**: SLA cron ganti offset pagination (`skip: processed`) ke keyset pagination (`id > lastId`) — mencegah degradasi batch akhir dan duplikasi/ skip data.
- **PERF-05**: Ganti `generateTicketNumber()` dari `MAX(SUBSTRING(…))` full table scan ke `nextval('ticket_number_seq')` PostgreSQL sequence O(1). Hapus `isolationLevel: 'Serializable'` karena sequence menghilangkan dependency. Migration `setval` dari data existing.
- **PERF-06**: Dashboard stats: tambah Redis cache key `dashboard:stats:v1` TTL 30 detik + `invalidateCache()`; SLA stats 4 count queries di-gabung jadi 1 query `COUNT(*) FILTER(WHERE...)`; daily trends ganti fetch semua ticket + loop Node ke SQL `date_trunc` + `GROUP BY`.
- **PERF-07**: CSV export pertahankan `MAX_EXPORT_ROWS=10000` guard; streaming untuk data besar dicatat sebagai future improvement.
- **PERF-08**: `LocalStorageService` ganti `fs.existsSync`/`mkdirSync`/`writeFileSync`/`unlinkSync` ke `fs.promises` async.
- **PERF-10**: Notification broadcast pakai `runWithConcurrency(users, 5, ...)` — 5 concurrent create; Telegram send pakai concurrency limit 3 + `Promise.allSettled`.
- **PERF-11**: `MaintenanceGuard` tambah in-memory cache 2 detik + `mget` untuk enabled + message — kurangi Redis round-trip per request.
- **PERF-12**: Route-level code splitting: semua page imports diganti `React.lazy()` + `Suspense` fallback. Build output menampilkan chunk terpisah per page.
- **PERF-13**: Nginx tambah `location /assets/` dengan `Cache-Control: public, max-age=31536000, immutable`; `index.html` no-cache.
- **PERF-14**: `SubCategoryManager` hilangkan N+1 request per-category — derive subCategories dari `useCategories()` yang sudah include `subCategories`.
- **PERF-15**: Navbar notification dropdown query tambah `enabled: notifOpen` + `staleTime: 30_000`.
- **PERF-19**: TanStack Query staleTime tuning — categories 30 menit, assignable users 10 menit, telegram config 5 menit.
- **PERF-20**: Backup listing limit 50 terbaru untuk hindari `Promise.all` besar.

## Prisma Migration
- Migration `20260626001000_add_perf_indexes`: tambah 15+ indexes, pg_trgm extension + 5 GIN indexes, `ticket_number_seq` sequence, dan partial index `tickets_resolved_category_partial_idx`.

## Redis
- Tambah `mget()` method ke `RedisService` untuk multi-key get atomik.
- DashboardModule import `RedisModule` untuk inject `RedisService`. (Karena tidak ada @Global)

## Docker
- Build: ganti bind mount `./frontend/dist` → named volume `frontend_dist` + frontend builder service (fix 403)
- Build: tambah `COPY postcss.config.js` & `COPY tailwind.config.js` ke Dockerfile (fix Tailwind tidak terproses)
- Build: hapus `COPY public ./public` (direktori tidak ada)
- Container: frontend service pakai `exec tail -f /dev/null` biar stay running (tidak exit code 0)
- Seed: compile `seed.ts` ke JS otomatis di startup, `upsert` update password tiap restart
- Redis: support `REDIS_URL` (ioredis) sebagai fallback `REDIS_HOST`/`REDIS_PORT`
- .env.example: tambah `REDIS_HOST` & `REDIS_PORT`

## Tickets
- Create: EndUser bisa akses menu/form New Ticket dan `POST /api/tickets` untuk membuat ticket sendiri
- Create: **FE-06** — partial success handling: jika ticket sudah dibuat tapi upload gagal, tampilkan warning + navigasi ke detail ticket (bukan error misleading)
- Status: tambah `OnHold` ke frontend (type, color, badge, statusFlows)
- Status Flows: samakan dengan backend (`Closed → Open`, `InProgress → OnHold/Resolved`)
- Status: clear `closedAt`/`resolvedAt` saat reopen ticket
- Priority: dropdown editable di tabel Tickets (ITSupport/Admin)
- Category: kolom baru di tabel Tickets
- Number: format `TKT-XXX` (sequential, tanpa YYMM)
- Delete: tambah tombol Delete (Admin only) + ConfirmDialog di detail & list
- Kolom Created By, Assigned To dropdown di list (ITSupport/Admin)

## Frontend UI/UX
- Dark Mode: `tailwind darkMode: 'class'`, theme-store zustand persist, toggle di sidebar
- Sidebar: minimize/expand (collapsed state, icon-only mode)
- Sidebar: New Ticket tidak ikut nge-highlight menu Tickets (NavLink `end` prop)
- PasswordInput: reusable dengan eye icon (hold to reveal)
- Waktu: formatDateTime jadi 24H (HH:mm)
- Notifikasi: dropdown toggle di Navbar + Mark all as read
- Notifikasi: **FE-03** — badge unread memakai `GET /notifications/unread-count` (server-side) + auto-refresh 30s; `useNotifications()` untuk list saja
- ErrorBoundary: wrapping App + route `/notifications`
- ProtectedRoute: fix envelope access `res.data.data.accessToken/user` — session restore setelah reload/deep link sekarang berfungsi (FE-01)
- Admin Master Data: fix unwrap API envelope `res.data.data` — gunakan `useCategories()` hook dan `unwrapData()` untuk kategori/subkategori (FE-02)
- Pagination: **FE-04** — hapus opsi "All" yang mengirim `limit=0` (invalid di backend); guard tambahan di `useTickets()` untuk skip `value === 0`
- Pagination: **FE-08** — tambah Previous/Next buttons untuk mobile (visible di bawah `sm` breakpoint)
- Telegram: **FE-05** — `useTelegramStatus()` dan `useTelegramConfig()` hanya fetch untuk Admin; non-admin tidak trigger request 403

## Users & Auth
- Role: Change Password hanya untuk Admin & ITSupport
- Role: Dashboard & New Ticket hide untuk EndUser
- Users: ITSupport bisa GET `/users` (assign dropdown)
- Users: `includeInactive=true` — user tetap terlihat setelah di-deactivate
- Users: hard-delete dengan transaction (FK error → "Deactivate the user instead")
- ValidationPipe: UpdateUserDto tambah field `isActive` (fix forbidden non-whitelisted)
- Auth: fix admin login gagal — password hash terupdate tiap restart
- Auth: **SECURITY** — tambah `tokenType` claim (`access`/`refresh`) ke JWT; refresh token tidak bisa dipakai sebagai Bearer API/WebSocket; validasi di JwtStrategy, Gateway, dan refresh/revoke (AUTH-01)
- Auth: **AUTH-02** — logout tidak memerlukan access token valid; cukup refresh cookie untuk revoke
- My Account: halaman `/my-account` untuk semua role, berisi profil & change password
- Change Password: pindah dari sidebar ke halaman My Account (bukan route terpisah)
- Change Password: **FE-09** — setelah change password, session di-clear dan redirect ke login
- Profile dropdown: Navbar — avatar user, My Account, theme toggle, Logout

## Dashboard
- SLA Compliance: fix literal `\n` di tooltip
- Ticket Trend: tampilkan "No activity" jika semua count 0
- Auto-refresh setelah ticket status/priority/assign berubah
- Category resolution: fix typo `avgMinutes` → `avgResolutionMinutes`
- Avg Resolution Time: unit cerdas — tampilkan jam (`≥60m`), menit (`≥1m`), atau detik (`<1m`) sesuai nilai
- `getDashboardStats()` dipindah dari TicketsService ke DashboardService — pemisahan concern yang benar
- Avg resolution time: ganti in-memory loop jadi raw SQL (`$queryRaw`) — lebih cepat untuk dataset besar

## Master Data
- Categories/Sub-categories: reactivate soft-deleted record saat create dengan nama sama
- Cross-invalidation categories ↔ subcategories
- Fix URL sub-categories: tambah `categoryId` di path update/delete
- Toast error handling di Master Data

## Comments & File Upload
- Backend: `POST /tickets/:ticketId/comments` kini menerima multipart/form-data dengan field `content`, `type`, dan `files` (max 3 file, 5MB each, allowed MIME types)
- Backend: `commentId` (optional) ditambahkan ke model Attachment — file terupload di link ke comment
- Frontend: CommentSection — tambah tombol "Attach files" dengan file list + remove, thumbnail preview untuk gambar
- Frontend: comment card — tampilkan attachment list dengan thumbnail preview (image) & tombol Download, modal full-size preview untuk gambar
- Prisma: `db push` untuk menambahkan kolom `commentId` + index
- Validasi MIME type dan file size dilakukan sebelum comment dibuat (bukan setelah) — rollback jika file gagal
- Semua file divalidasi dalam batch sebelum satupun diproses
- Attachment: **ATT-01** — attachment komentar `INTERNAL` otomatis disimpan sebagai `INTERNAL`; nested attachment difilter untuk EndUser menggunakan `AttachmentVisibilityPolicy`
- Comment: **FE-07** — `useAddComment()` invalidate `['ticket', id, 'attachments']` saat komentar membawa file

## Filter, Date, Sorting
- Assigned to Me: filter by current user ID (sebelumnya tidak berfungsi)
- Date Range: ganti 2 date picker terpisah jadi dropdown preset (All Time, Today, Last 7 Days, Last 30 Days, This Month, Custom) — hemat tempat
- Attachment upload: max 3 files, max 5MB each (New Ticket)
- Input date muncul hanya saat pilih Custom
- Backend: `dateTo` di-set ke 23:59:59.999 UTC agar ticket yang dibuat setelah tengah malam tetap terfilter
- Custom: start date `max` dibatasi end date, end date `min` dibatasi start date
- Backend `GET /api/tickets`: tambah sort fields `ticketNumber`, `subject`, `status` ke whitelist (`allowedSortFields`)
- Frontend: column headers Ticket #, Subject, Status, Priority, Created jadi clickable sort — toggle asc/desc
- Sort indicator (arrow icon) pada active sort column, semi-transparent panah pada inactive column
- Sort state (`sortBy`/`sortOrder`) di `FilterValues`, berubah via `onFiltersChange` → reset page ke 1
- Backend `sortBy` whitelist: `createdAt`, `updatedAt`, `slaDueAt`, `priority`, `ticketNumber`, `subject`, `status`

## Items Per Page
- Frontend: dropdown "Items per page" (10, 25, 50, 100, All) di pagination area, applies immediately tanpa tombol Apply
- Backend: `limit=0` support untuk "All" (return semua data tanpa pagination)
- Frontend: `limit` ditambahkan ke `FilterValues`, reset page ke 1 saat berubah
- Pagination component: tampilkan items per page dropdown + total items count, hide page buttons saat "All"

## Security
- Env: `validateEnv()` di startup — throw jika `JWT_SECRET`/`DATABASE_URL` tidak diset
- JWT: hapus hardcoded `'super-secret-key'` fallback di 3 file (auth.module, jwt.strategy, auth.service)
- JWT: **OPS-02** — tambah `change-this-to-random-secret` ke denylist + enforce minimum 32 chars di production
- WebSocket: validasi JWT via `jwtService.verify()` di handshake gateway (S-2)
- Auth: refresh token pindah ke httpOnly cookie (`secure`, `sameSite: strict`, path `/api/auth`)
- Auth: access token hanya di memory (zustand tanpa persist) — tidak ada token di localStorage
- Auth: silent refresh otomatis di `ProtectedRoute` saat page reload
- Auth: **OPS-03** — helper `getRefreshCookieOptions()` seragam login/refresh/logout + `COOKIE_SECURE` env untuk explicit control
- Ticket: `findById` filter untuk EndUser — hanya bisa lihat ticket milik sendiri (S-4)
- Backend: global exception filter (`HttpExceptionFilter`) — semua error terformat konsisten `{ error: { code, message } }`
- Backend: helmet security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, dll)
- Backend: morgan request logging (stdout, tertangkap Docker logs)
- Backend: CORS lockdown via env `CORS_ORIGIN` (dipisah koma untuk multi-origin)
- Backend: redis-url validation — `REDIS_URL` wajib diset, startup throw jika tidak ada
- Backend: Prisma connection pool — via `DATABASE_POOL_MAX` env (default 10, `connection_limit` di connection string)
- Backend: `esModuleInterop: true` di tsconfig + perbaiki import cookieParser jadi default import
- Backend: packages baru — `helmet@6`, `morgan`, `@types/morgan`
- Ticket: `PATCH /:id/status` — EndUser hanya bisa close own resolved ticket (`Resolved → Closed`), ownership + role di-service
- WebSocket: `handleConnection()` cek `user.isActive` di DB (tidak hanya verify JWT) — disconnect jika user dinonaktifkan
- Env: `backend/.env` — `JWT_SECRET` diganti random 256-bit hex, `CORS_ORIGIN` diisi

## Post-Code-Review Fix
- Fix: `useTicketAuditTrail` dihapus (B-1) tapi `TicketDetail.tsx` masih import & pakai — ganti ke `ticket.histories`
- Fix: Tambah `histories`, `comments`, `attachments` ke `Ticket` interface (types/index.ts)
- Fix: `frontend/node_modules` & `frontend/dist` ownership root (dari Docker) — `rm -rf` & reinstall

## Export CSV
- Backend: `GET /api/tickets/export/csv` (ITSupport/Admin only) — download CSV dengan filter yang sama seperti list
- Frontend: Tombol "Export CSV" di header TicketsPage (ITSupport/Admin)
- CSV headers: Ticket #, Subject, Status, Priority, Category, Sub Category, Created By, Assigned To, Created At, Resolved At, SLA Status
- CSV: export quote semua field dan neutralize formula injection (`=`, `+`, `-`, `@`, tab, CR)

## Notifications
- Backend: `DELETE /api/notifications` — hapus semua notifikasi user
- Frontend: Tombol "Clear all" di NotificationsPage & dropdown Navbar
- `ticket.created`: notifikasi dikirim juga ke requester (jika bukan ITSupport/Admin)
- `ticket.status.updated`: event selalu di-fire (tidak hanya untuk assigned tickets), notifikasi dikirim ke assignee + requester
- Payload event ditambah field `subject` dan `requesterId`

## Theme
- Dark Mode: `tailwind darkMode: 'class'`, theme-store zustand persist
- Theme switcher: Light/Dark ada di profile dropdown Navbar

## Login
- Bug: axios interceptor ikut nge-handle 401 dari `/auth/login` dan nyoba refresh token — error asli "Invalid email or password" ketelan
- Fix: tambah pengecualian `/auth/login` di axios interceptor
- Fix: tambah `toast.error()` di `useLogin` hook biar error muncul sebagai toast

## Telegram
- Backend: tambah `POST /api/telegram/test-notification` (Admin only) + `sendTestNotification()` method
- Backend: `sendTestNotification()` membaca settings (groupChat/individual) — kirim sesuai preferensi
- Backend: group chat failure tidak blocking — fallback ke individual, error dilaporkan sebagai partial failure
- Backend: validasi real-time dari Telegram API — throw `BadRequestException` jika gagal (token tidak dikonfigurasi, akun tidak link, atau error dari Telegram)
- Frontend: tombol "Test Notification" di My Account (Admin) — muncul hanya saat Telegram sudah link
- Frontend: toast success/error — menampilkan pesan error asli dari backend/Telegram API
- Fix: `sendTestNotification` tidak throw partial failure jika group chat gagal tapi individual berhasil — cukup return success + server-side log
- Fix: `updateConfig` support clear bot token (kirim `""` → hapus dari DB, fallback ke env var)
- Backend: tambah `POST /api/telegram/check` (Admin only) + `checkConfig()` method
- Backend: `checkConfig()` validasi bot token via `getMe` API + group chat ID via `getChat` API
- Frontend: tombol "Check" di Bot Settings — validasi real-time, tampilkan status inline ✅/❌
- Frontend: validasi Group Chat ID — "Save Settings" disable + pesan error jika group chat di-enable tapi ID kosong
- Telegram: fix create config typo dan clear bot token hanya saat token field diubah
- Fix: **TG-01** — `generateLinkCode()` sekarang buat 6-char code (sebelumnya 10-char), bot handler terima 6-char

## Production Readiness
- Maintenance Mode: global `MaintenanceGuard` blocks non-admin API requests when `maintenance:enabled=1` in Redis; allowed endpoints: `/health`, `/maintenance/*`, `/auth/*`
- Maintenance Mode: health endpoint includes `maintenance: { enabled, message }` in response for frontend polling
- Maintenance Mode: `GET /api/maintenance/mode` (public) + `PATCH /api/maintenance/mode` (Admin) for manual toggle
- Maintenance Mode: frontend `MaintenanceBanner` polls health every 5s, shows amber overlay when maintenance active
- Maintenance Mode: Admin must enable maintenance first before backup/restore buttons are active in UI
- Maintenance Mode: auto-enable before restore (5s drain), auto-disable after restore completes
- Backup: detail isi `db.sql.gz` ditambahkan ke docs (semua tabel public schema); Redis tidak di-backup
- Maintenance UI: tambah route Admin `/admin/maintenance` untuk create/list/download/delete backup DB dan uploads
- Maintenance UI: tombol Delete backup memakai `ConfirmDialog` standar dan menghapus folder backup timestamp
- Maintenance UI: tombol Restore melakukan restore penuh DB + uploads dengan typed confirmation dan logout paksa setelah sukses
- Maintenance API: tambah endpoint Admin-only `/api/maintenance/backups`, download backup DB/uploads, dan `DELETE /api/maintenance/backups/:id`
- Maintenance API: tambah `POST /api/maintenance/backups/:id/restore`; validasi gzip, buat pre-restore backup otomatis, restore DB via `psql`, restore uploads via `tar`
- Backup UI: tombol `DB` download `db.sql.gz`; tombol `Uploads` download `uploads.tar.gz`
- Docker: API image install `postgresql-client-16`, `gzip`, `tar`, `gosu`; mount `./backups:/app/backups` untuk backup dari UI
- Docker: tambah `backend/docker-entrypoint.sh` untuk chown `/app/uploads` dan `/app/backups` sebelum drop ke user `node`
- Backup: UI backup parse `DATABASE_URL` ke env libpq untuk `pg_dump`, menjaga `schema` sebagai `--schema`, dan menghindari pipeline yang menutupi error dump
- Backup: tambah `scripts/backup.sh` untuk membuat `db.sql.gz`, `uploads.tar.gz`, dan `manifest.txt` ke `backups/<timestamp>/`
- Backup: `backups/` ditambahkan ke `.gitignore`
- Seed: production Docker CMD tidak lagi menjalankan seed otomatis; restart container tidak mereset credential default
- Seed: `prisma/seed.ts` tidak lagi update password user default yang sudah ada; sample ticket dilewati saat `NODE_ENV=production`
- Docker: tambah `restart: unless-stopped` di semua service — auto-restart saat crash
- Docker: tambah healthcheck di service `api` (`GET /api/health`, interval 30s, start_period 30s)
- Docker: tambah logging config (`json-file`, max-size 10m, max-file 3) — cegah disk penuh
- Prisma: ganti `npx prisma db push` → `npx prisma migrate deploy` di Dockerfile CMD — migration versioned, aman, rollbackable
- Prisma: initial migration `20260623000000_init` dibuat dari `prisma migrate diff` + resolve
- Docker: backend image pakai `npm ci`, `npm ci --omit=dev`, `USER node`; API host port bind ke `127.0.0.1:3000`

## HTTPS
- Nginx: tambah SSL/TLS via mkcert (self-signed CA) — domain `helpdesk.rsmch.internal`
- Nginx: listen port 80 untuk redirect 301 → HTTPS, port 443 untuk SSL
- Nginx: mount `./nginx/certs` volume untuk SSL cert & key
- Docker: expose port 443 di service nginx
- Git: ignore `nginx/certs/` biar private key tidak ter-commit
- Healthcheck: fix URL dari `/api/health` → `/health` (app tidak pakai global prefix)
- Backend: fix Dockerfile — tambah `wget` ke apt-get install untuk healthcheck

## SLA
- `performSLACheck()` pakai batch pagination 500/trip (P-1)
- `performSLACheck()` ganti per-ticket `update` jadi `updateMany` batch — mengurangi jumlah query dari N menjadi max 3 per batch

## Prisma Indexes
- User: tambah composite index `(role, isActive)` — percepat query filter role + status aktif
- TicketHistory: tambah index `(userId)` — percepat query history per user
- Prisma: migration `20260624000000_add_missing_indexes` menambahkan index `(role, isActive)` dan `ticket_history(userId)`

## Repository Pattern
- Backend: tambah `common/repositories/` dengan 9 domain repository — abstraction layer di atas PrismaService
- Backend: semua service sekarang inject repository (e.g., `TicketRepository`) bukan `PrismaService` langsung
- Backend: `RepositoriesModule` (@Global) — import sekali di `AppModule`, export semua repository
- Backend: `tickets.service.spec.ts` — update mock dari `PrismaService` ke repository mock

## Frontend Restructuring
- Auth: pindah dari `components/auth/` → `auth/` (top-level sub-module)
- Layout: pindah dari `components/layout/` → `layout/` (top-level sub-module)
- Hapus `ChangePasswordPage.tsx` (unused dead code)
- Update import paths di `App.tsx` & `LoginPage.tsx`
- tsconfig: tambah `forceConsistentCasingInFileNames: true`

## Code Review Hardening — Security & Deployment
- Backend: `POST /api/tickets` dibatasi ke ITSupport/Admin; frontend route `/tickets/new` dan tombol Create Ticket ikut role-gated
- Backend: EndUser ownership check ditambahkan untuk create comment, upload/list attachment, dan download attachment
- Backend: attachment dari internal comment difilter dari ticket detail/list/download untuk EndUser
- Auth: inactive user ditolak saat login; logout membaca refresh cookie dan revoke token Redis (`refresh:{sub}:{jti}`)
- Upload: Multer `limits` + MIME `fileFilter` di comment/attachment endpoint; nginx `client_max_body_size 10m`
- Error: non-HTTP exception tidak membocorkan internal message ke client
- Ticket: generate number + create ticket + initial history dalam satu serializable transaction dengan retry; inactive category/sub-category ditolak
- Assignment: `assignedToId: null` support unassign ticket
- Frontend: `getErrorMessage()` support `{ error: { message } }`, `useUsers()` hanya enabled untuk role assign, MyAccount hydration pindah ke `useEffect`

## Code Review Fixes (CR-01 to CR-12)
- CR-01 (Critical): Upload filename aman — `buildSafeUploadPath()` extract extension via `path.extname(path.basename())` + containment check; `LocalStorageService` defense-in-depth
- CR-02 (Critical): Restore gagal tidak lagi mematikan maintenance mode — `restoreSucceeded` flag, `createBackup('pre-restore')` dilakukan setelah maintenance aktif + drain
- CR-03 (High): Production seed wajib env `SEED_ADMIN_PASSWORD` dan `SEED_SUPPORT_PASSWORD`; dev tetap pakai default credential; password production tidak di-log
- CR-04 (High): `prisma` dipindah dari `devDependencies` ke `dependencies`; Dockerfile CMD pakai `npx --no-install prisma migrate deploy`
- CR-05 (High): `generateTicketNumber()` pakai raw SQL `MAX(CAST(SUBSTRING(...)))` alih-alih string sort — fix duplikat setelah TKT-999
- CR-06 (High): `getConfig()` Telegram strip `groupChatId` dari response; frontend hanya terima `hasGroupChatId` flag
- CR-07 (Medium): EndUser bisa close own resolved ticket via tombol `Close Ticket` di TicketDetail
- CR-08 (Medium): Axios refresh queue reject saat `accessToken` null — pending requests tidak hang
- CR-09 (Medium): Nginx tambah `location /socket.io/` dengan WebSocket upgrade headers
- CR-10 (Medium): `backup.sh` baca dari `backend/.env` (canonical source); `docker-compose.yml` db service `env_file: ./backend/.env`; tambah `POSTGRES_USER/PASSWORD/DB` ke `.env.example`
- CR-11 (Medium): EndUser `_count` hanya hitung visible comments/attachments (public + direct), bukan semua
- CR-12 (Medium): SLA controller pakai DTO classes (`CreateSlaConfigDto`, `UpdateSlaConfigDto`) dengan `class-validator` decorators
- Bug fix: raw SQL `generateTicketNumber()` koreksi nama tabel dari `"Ticket"` ke `"tickets"` (Prisma PostgreSQL default snake_case plural)

## Security Review Fixes (SEC-001 to SEC-016, SEC-019, SEC-020)
- WebSocket: access token hanya diterima dari Socket.IO `auth`, bukan query string.
- Auth: refresh token user direvoke saat password berubah/reset/deactivate; frontend refresh interceptor sekarang update `user` state.
- Restore: validasi archive upload backup terhadap path traversal/symlink/hardlink dan restore via temporary directory swap.
- Dependencies: override `tar` ke versi fixed; `multer` high masih butuh migrasi NestJS 11.
- Users/RBAC: `/users` dibatasi Admin-only, assignment memakai endpoint minimal `/users/assignable`.
- Tickets: EndUser tidak menerima audit trail; status/assign/priority update dan history insert dibuat atomic; assignment ke inactive user ditolak.
- Attachments: tambah `Attachment.visibility` (`PUBLIC`/`INTERNAL`), magic-byte upload validation, safe `Content-Disposition`, stream error handling, dan UI selector/badge visibility.
- Pagination: DTO pagination bounded (`limit` min 1 max 100) untuk menghindari query unbounded.
- Telegram: link/unlink/status Admin-only, link code memakai `crypto.randomBytes()`, dan template variables di-escape untuk Telegram HTML.
- Backup: create backup wajib maintenance mode, dilindungi Redis lock, dan restore/logout flow clear React Query cache.
- Deployment: Redis compose service memakai `REDIS_PASSWORD`/`requirepass`, API startup production mewajibkan `REDIS_PASSWORD`, dan nginx menambahkan security headers.
- Frontend: React Query Devtools hanya dirender saat development; EndUser dapat change password sendiri.
- Env/seed: production menolak weak `JWT_SECRET` placeholder dan seed production tetap wajib `SEED_ADMIN_PASSWORD`/`SEED_SUPPORT_PASSWORD`.

## Code Review Fixes — F-01 & F-02 (Phase 0)
- F-01 (P0): Centralized attachment visibility policy (`AttachmentVisibilityPolicy`) — EndUser hanya bisa melihat PUBLIC direct attachments dan attachments dari PUBLIC comments. Policy diterapkan di `TicketsService.findAll`, `TicketsService.findById` (count), `AttachmentsService.findByTicketId`, dan `AttachmentsService.getDownloadInfo`. Sebelumnya: direct attachment INTERNAL bocor karena filter hanya mengecek `commentId: null OR comment.type: PUBLIC` tanpa cek `visibility`.
- F-01: Tambah 12 unit test untuk visibility boundary (EndUser/ITSupport/Admin).
- F-02 (P1): Register `TransformInterceptor` global via `APP_INTERCEPTOR` — semua success response di-wrap `{ data, meta? }` secara konsisten. Stream/CSV/blob responses di-skip.
- F-02: `HttpExceptionFilter` gunakan `resp.code` jika ada, fallback ke `getCodeFromStatus(status)` — menghasilkan code stabil (`BAD_REQUEST`, `NOT_FOUND`, `MAINTENANCE`, dll) bukan `resp.error` Nest default.
- F-02: `MaintenanceGuard` throw exception dengan `code: 'MAINTENANCE'` eksplisit.
- F-02: Frontend tambah `ApiEnvelope<T>`, `unwrapData<T>()`, `unwrapPage<T>()`, `unwrapBlob()` helpers. Semua hooks di-update untuk gunakan adapters.
- F-02: Hapus `refreshToken` dari `AuthResponse` type (drift fix — frontend tidak menerima refresh token di body, hanya httpOnly cookie).
- F-02: `NotificationsPage` fix `data.data` → `data` (sudah unwrap oleh interceptor).

## Code Review Fixes — CODE_REVIEW.md (Sesi 1-14)
- **AUTH-01**: Tambah `tokenType` claim (`access`/`refresh`) ke JWT; `JwtStrategy` dan `NotificationsGateway` reject non-access tokens; `refresh()` validasi `tokenType === 'refresh'` + `jti` + compare stored Redis token.
- **FE-01**: Fix `ProtectedRoute` baca `res.data.data.accessToken/user` (envelope access) + tambah type `RefreshResponse`.
- **FE-02**: Fix `MasterDataManagement` pakai `useCategories()` hook + `unwrapData()` + `Promise.all` untuk subcategories.
- **OPS-02**: Tambah `change-this-to-random-secret` ke denylist + enforce min 32 chars JWT_SECRET di production.
- **OPS-03**: Tambah `getRefreshCookieOptions()` helper (login/refresh/logout) + `COOKIE_SECURE` env; fix logout `clearCookie` pakai options yang sama.
- **TG-01**: Fix `generateLinkCode()` buat 6-char code (sebelumnya 10-char, bot validator expect 6).
- **AUTH-02**: Hapus `@UseGuards(JwtAuthGuard)` dari logout endpoint — cookie-based revoke only.
- **FE-09**: After change password: `logout()`, `queryClient.clear()`, redirect ke `/login` dengan message.
- **ATT-01**: Internal comment attachments auto-set `visibility: INTERNAL`; EndUser nested attachments difilter via `AttachmentVisibilityPolicy`.
- **FE-04**: Hapus opsi "All" dari Pagination; tambah `value !== 0` guard di `useTickets()`.
- **FE-05**: `useTelegramStatus()` dan `useTelegramConfig()` accept `enabled` option; MyAccountPage pass `enabled: isAdmin`.
- **FE-07**: `useAddComment()` invalidate `attachments` query saat files ada.
- **FE-03**: Baru `useUnreadNotificationCount()` hook panggil `/notifications/unread-count` (server-side) + auto-refresh 30s.
- **FE-06**: Partial success: per-file upload errors caught, navigasi ke `/tickets/:id`.
- **FE-08**: Mobile Previous/Next buttons visible di bawah `sm` breakpoint di Pagination.
- **OPS-01**: Update `backend/.env.example` dengan Docker vs local dev comments.
- **OPS-08**: Tambah `umask 077` + `chmod 700/600` di backup dirs/files di `scripts/backup.sh`.
- **CAT-01**: `delete()` di categories.service.ts cek `_count.subCategories` dan `_count.slaConfigs` sebelum hard delete; soft-deletes jika ada relations.
- **OPS-09**: `backup.sh` ganti `source .env` dengan targeted `grep` untuk parse `POSTGRES_USER`/`POSTGRES_DB`.
- **OPS-06**: Tambah `location /api/maintenance/` di `nginx.conf` dengan `proxy_read_timeout 600s`.
- **DATA-01**: Pindah file deletion di `tickets.service.ts delete()` SETELAH DB transaction commit.
- **SLA-02**: Tambah `setNx(key, value, ttl)` ke `RedisService` pakai `SET NX EX`; `checkSLA()` pakai atomic `setNx()`.
- **ATT-02**: `AttachmentRepository.findByTicketId()` accept `{ select?, include? }`; `attachments.service.ts` pakai `ATTACHMENT_SAFE_SELECT` exclude `path`.
- **SLA-01**: `updatePriority()` recalc `slaDueAt` dari `createdAt`, compute `slaStatus`.
- **OPS-04**: Tambah `RESTORE_LOCK_KEY` dengan `SET NX EX` (30min TTL) untuk restore process.
- **OPS-10**: Dokumentasi Redis persistence tradeoff di `AGENTS.md`.
- **FE-10**: `CreateTicketForm.tsx` filter `categories` hanya `isActive === true`.
- **API-01**: Tambah `QueryUsersDto` dan `QueryNotificationsDto` di `pagination-query.dto.ts`.
- **OPS-05**: `assertSafeTarArchive()` pakai `tar -tzvf` dan reject symlink/hardlink entries.
- **OPS-07**: `nginx.conf` `client_max_body_size` naik dari `10m` ke `20m`.
- **API-02**: `exportCsv()` tambah `take: 10000` limit.
- **OPS-11**: Production seed rotate passwords via `update: { password }` di upsert.
- **OPS-12**: `start:prod` ganti dari `node dist/main` ke `node dist/src/main`.
- **OPS-13**: Tambah `set_real_ip_from` untuk private ranges + `real_ip_header X-Forwarded-For`.
- **TG-02**: Schema migration `20260626000000_add_telegram_config_singleton_key` tambah `key String @unique @default("default")` ke `TelegramConfig`.
- **OPS-04 lock**: Tambah `acquireLock()`/`releaseLock()` helpers dengan random token ke `MaintenanceService`.

## Frontend Test Infrastructure (Sesi 15)
- Vitest dipasang sebagai test runner; `vite.config.ts` update dengan test config; `src/test/setup.ts` buat `@testing-library/jest-dom`.
- `ProtectedRoute.test.tsx`: 3 tests — refresh envelope, unauthenticated redirect, auth display.
- `auth-store.test.tsx`: 3 tests — login, logout, token persistence.
- `Pagination.test.tsx`: 5 tests — page info, no "All" option, Next click, Previous disabled, Next disabled.
- `use-notifications.test.tsx`: 2 tests — unread count fetch, notifications list fetch.
- Total: 13 frontend tests, semua pass.

## Docker
- Build: fix `npm ci` failure — regenerate lockfiles dengan Docker node version (npm 10) untuk kompatibilitas.
