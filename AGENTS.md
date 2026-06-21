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
docker compose up --build       # localhost:80
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

## Perbaikan Terakhir
- Dashboard: fix typo avgMinutes → avgResolutionMinutes (category resolution NaN)
- Dashboard: Ticket Trend tampilkan "No activity" jika semua count 0
- Ticket Status: tambah OnHold ke frontend (type, color, badge, statusFlows)
- Status Flows: samakan dengan backend (Closed → Open, InProgress → OnHold/Resolved, dll)
- Closed → Open: clear closedAt/resolvedAt saat reopen ticket
- Priority: dropdown editable di tabel Tickets untuk ITSupport/Admin
- Category: kolom baru di tabel Tickets
- Ticket Number: format TKT-YYMM-XXX (3-digit sequence)
- Ticket Detail: tambah tombol Delete (Admin only) dengan ConfirmDialog
- Ticket List: tambah kolom Created By, Assigned To dropdown (ITSupport/Admin)
- Ticket List: tambah tombol Delete (Admin only) dengan ConfirmDialog
- Ticket Number: format berubah jadi TKT-XXX (sequential, tanpa YYMM)
- Waktu: formatDateTime jadi 24H (HH:mm)
- Users: ITSupport bisa GET /users (assign dropdown)
- Notifikasi: Mark all as read di dropdown navbar
- New Ticket: attachment upload (max 3 files, max 5MB each)
- Dashboard: auto-refresh setelah ticket status/priority/assign berubah
- Assigned to Me: filter checkbox sekarang benar-benar filter oleh user ID
- Sidebar: New Ticket tidak ikut nge-highlight menu Tickets (NavLink end prop)
- Master Data: cross-invalidation categories ↔ subcategories
- ValidationPipe: UpdateUserDto tambah field isActive (fix "property isActive should not exist")
- User Deactivate: includeInactive=true agar user tetap terlihat di list setelah di-deactivate
- User Delete: hard-delete dengan transaction (hapus notifications, ticketHistory, unassign tickets), jika gagal karena FK → pesan error "Deactivate the user instead"
- Master Data: fix URL sub-categories (tambah categoryId di path update/delete) + toast error handling
- Sidebar: tombol minimize (collapsed state, icon-only mode)
- Dark Mode: tailwind darkMode: 'class', theme-store zustand persist, toggle button di sidebar, dark variants di semua komponen utama
- PasswordInput: komponen reusable dengan eye icon (hold to reveal)
- Notifikasi: dropdown toggle di Navbar, klik notifikasi → navigate ke tiket
- Notifikasi counter: auto-fetch via useNotifications() di Layout
- Change Password: hanya untuk role Admin & ITSupport
- Dashboard: hide untuk EndUser
- New Ticket: hide untuk EndUser
- SLA Compliance dashboard: fix literal \n
- Categories/Sub-categories: reactivate soft-deleted record saat create dengan nama yang sama
- ErrorBoundary wrapping App + route /notifications
- Dockerfile: compile seed.ts ke JS dan jalankan otomatis di startup
- Seed: update `upsert` dengan `update: { password }` agar kredensial ter-refresh tiap restart
- Auth: fix admin login gagal karena password hash tidak terupdate
- Redis: support REDIS_URL (ioredis connection string) sebagai fallback REDIS_HOST/REDIS_PORT
- .env.example: tambah REDIS_HOST & REDIS_PORT agar sesuai dengan redis.service.ts
