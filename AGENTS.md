# IT Support Ticketing

## Stack
Backend: NestJS + Prisma + PostgreSQL + Redis
Frontend: React 18 + Vite + TanStack Query + Zustand + Tailwind

## Struktur Kunci
```
backend/src/{auth,tickets,comments,attachments,categories,dashboard,users,sla,notifications,health}
frontend/src/{pages(8),components/{auth,layout,tickets,dashboard,admin,ui},hooks,stores,types,lib}
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
GET|PATCH /api/tickets/:id
PATCH /api/tickets/:id/status|assign
GET|POST /api/tickets/:id/comments|attachments
GET|POST|PATCH|DELETE /api/categories
GET|POST|PATCH /api/sla-configs
GET /api/dashboard/stats
GET|POST|PATCH|DELETE /api/users        # GET ?includeInactive=true untuk lihat inactive users
```

## Frontend Routes
```
/login, /tickets, /tickets/new, /tickets/:id
/dashboard, /notifications, /change-password
/admin/users, /admin/master-data
```

## Perbaikan Terakhir
- Role EndUser: type UserRole 'User' → 'EndUser', sidebar nav items, form option
- Create User: explicit payload destructuring (tanpa isActive), backend reactivates inactive user jika email sudah dipakai
- Delete User: backend findAll default filter isActive=true (user terhapus hilang dari list); tombol Delete + ConfirmDialog
- Change Password: endpoint POST /api/auth/change-password + halaman /change-password + sidebar link
- Error handling: try-catch di handleSubmit, handleToggleActive, handleDelete — error ditampilkan di modal/alert
- Auth persist: zustand persist middleware ke localStorage
- Dashboard blank: transform format backend ke DashboardStats type
- Type mismatch: semua id string UUID, user pakai name, comment pakai type
- ErrorBoundary wrapping App + route /notifications
- Fix Number(id) bug di TicketDetailPage
