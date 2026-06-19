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
POST /api/auth/login|refresh|logout
GET|POST /api/tickets
GET|PATCH /api/tickets/:id
PATCH /api/tickets/:id/status|assign
GET|POST /api/tickets/:id/comments|attachments
GET|POST|PATCH|DELETE /api/categories
GET|POST|PATCH /api/sla-configs
GET /api/dashboard/stats
GET|POST|PATCH|DELETE /api/users
```

## Frontend Routes
```
/login, /tickets, /tickets/new, /tickets/:id
/dashboard, /notifications
/admin/users, /admin/master-data
```

## Perbaikan Terakhir (commit 58fd5c8a)
- Auth persist: zustand persist middleware ke localStorage
- Dashboard blank: transform format backend ke DashboardStats type
- Type mismatch: semua id string UUID, user pakai name, comment pakai type
- ErrorBoundary wrapping App + route /notifications
- Fix Number(id) bug di TicketDetailPage
