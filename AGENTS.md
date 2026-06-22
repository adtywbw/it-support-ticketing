# IT Support Ticketing

## Stack
Backend: NestJS + Prisma + PostgreSQL + Redis
Frontend: React 18 + Vite + TanStack Query + Zustand + Tailwind

## Struktur Kunci
```
backend/src/{auth,tickets,comments,attachments,categories,sub-categories,dashboard,users,sla,notifications,health}
frontend/src/{pages(9),components/{auth,layout,tickets,dashboard,admin,ui},hooks,stores,types,lib}
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
GET|PATCH|DELETE /api/tickets/:id
PATCH /api/tickets/:id/status|assign|priority
GET|POST /api/tickets/:id/comments|attachments
GET|POST|PATCH|DELETE /api/categories
GET|POST|PATCH|DELETE /api/categories/:categoryId/sub-categories
PATCH|DELETE /api/sub-categories/:id     # (deprecated, use full path)
GET|POST|PATCH /api/sla-configs
GET /api/dashboard/stats
GET|POST|PATCH|DELETE /api/users      # GET ?includeInactive=true untuk lihat inactive users
```

## Frontend Routes
```
/login, /tickets, /tickets/new, /tickets/:id
/dashboard, /notifications, /change-password
/admin/users, /admin/master-data
```

## Role & Access
| Role | Dashboard | New Ticket | Change Password | Users | Master Data |
|------|-----------|------------|-----------------|-------|-------------|
| EndUser | ✗ | ✗ | ✗ | ✗ | ✗ |
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

### Filter
- Assigned to Me: filter by current user ID (sebelumnya tidak berfungsi)
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
