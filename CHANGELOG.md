# Changelog

Riwayat perubahan project yang dipindahkan dari `AGENTS.md` agar project memory tetap ringkas.

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
- Notifikasi: counter auto-fetch via `useNotifications()` di Layout
- ErrorBoundary: wrapping App + route `/notifications`

## Users & Auth
- Role: Change Password hanya untuk Admin & ITSupport
- Role: Dashboard & New Ticket hide untuk EndUser
- Users: ITSupport bisa GET `/users` (assign dropdown)
- Users: `includeInactive=true` — user tetap terlihat setelah di-deactivate
- Users: hard-delete dengan transaction (FK error → "Deactivate the user instead")
- ValidationPipe: UpdateUserDto tambah field `isActive` (fix forbidden non-whitelisted)
- Auth: fix admin login gagal — password hash terupdate tiap restart
- My Account: halaman `/my-account` untuk semua role, berisi profil & change password
- Change Password: pindah dari sidebar ke halaman My Account (bukan route terpisah)
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
- WebSocket: validasi JWT via `jwtService.verify()` di handshake gateway (S-2)
- Auth: refresh token pindah ke httpOnly cookie (`secure`, `sameSite: strict`, path `/api/auth`)
- Auth: access token hanya di memory (zustand tanpa persist) — tidak ada token di localStorage
- Auth: silent refresh otomatis di `ProtectedRoute` saat page reload
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
