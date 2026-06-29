# AI Agent Review Tasks

This file is an execution brief for another AI agent. It summarizes the code review findings and turns them into actionable engineering tasks.

## Project Context

- Repository: IT Support Ticketing
- Backend: NestJS 10, Prisma 5, PostgreSQL 16, Redis 7, Socket.IO
- Frontend: React 18, Vite 5, TanStack Query 5, Zustand, Tailwind
- API success envelope: `{ data, meta? }`
- API error envelope: `{ error: { code, message } }`

Before editing, read:

1. `AGENTS.md`
2. `CHANGELOG.md`
3. The exact files listed in the task being implemented

Do not perform unrelated refactors. Do not persist access tokens in browser storage. Do not add hardcoded fallbacks for `JWT_SECRET`, `DATABASE_URL`, or `REDIS_URL`.

## Verification Baseline

Known review-time results:

- `backend`: `npm test -- --runInBand` passed, 6 suites / 63 tests.
- `backend`: `npx tsc --noEmit -p tsconfig.json` passed.
- `frontend`: `npm run lint` passed.
- `frontend`: `npx tsc --noEmit -p tsconfig.json` passed.
- `frontend`: `npm test` failed because tests are stale/mocked incorrectly.
- Backend production dependency audit found vulnerabilities.
- Frontend production dependency audit found 0 vulnerabilities.

Use narrow verification after each change.

## Highest Priority Tasks

### Task 1 - Fix backend dependency vulnerabilities

Severity: High

Files:

- `backend/package.json`
- `backend/package-lock.json`
- Upload-related code only if breaking dependency changes require code updates:
  - `backend/src/attachments/attachments.controller.ts`
  - `backend/src/comments/comments.controller.ts`

Problem:

`npm audit --omit=dev --audit-level=high` reported backend vulnerabilities, including high-severity Multer denial-of-service advisories. Upload endpoints are reachable by authenticated users.

Goal:

Upgrade/pin backend production dependencies so the production audit no longer reports high-severity issues.

Suggested approach:

1. Run `npm audit --omit=dev --audit-level=high` from `backend`.
2. Upgrade the Nest platform/upload dependency chain carefully.
3. Preserve upload limits and MIME checks.
4. Regenerate lockfile with the Docker node version if package changes are made, per `AGENTS.md`.

Verification:

```bash
cd backend
npm test -- --runInBand
npx tsc --noEmit -p tsconfig.json
npm audit --omit=dev --audit-level=high
```

If lockfiles are changed locally, also run the Docker lockfile compatibility command from `AGENTS.md`.

### Task 2 - Fix frontend tests

Severity: Medium

Files:

- `frontend/src/auth/__tests__/ProtectedRoute.test.tsx`
- `frontend/src/hooks/__tests__/use-notifications.test.tsx`
- Possibly `frontend/src/hooks/use-notifications.ts`

Problems:

1. `ProtectedRoute.test.tsx` mocks `axios` globally, but `frontend/src/lib/axios.ts` expects `axios.create().interceptors`.
2. `use-notifications.test.tsx` expects `useNotifications()` to return an array, but the hook now returns `{ data, meta }` via `unwrapPage()`.

Goal:

Make frontend tests pass without changing production behavior.

Suggested approach:

- In the ProtectedRoute test, mock `axios.default.create` or avoid importing the axios client module through a broken global mock.
- In the notifications test, mock `unwrapPage` or expect the paginated shape.

Verification:

```bash
cd frontend
npm test
npm run lint
npx tsc --noEmit -p tsconfig.json
```

### Task 3 - Fix SLA partial update validation

Severity: Medium

Files:

- `backend/src/sla/sla.service.ts`
- `backend/src/common/repositories/sla-config.repository.ts` if needed
- Add/update tests under `backend/src/sla/` if a spec exists or create focused service tests

Problem:

`SLAService.update()` only checks that `resolutionTimeMinutes >= responseTimeMinutes` when both fields are provided. A partial update can violate the invariant.

Current location:

- `backend/src/sla/sla.service.ts`, `update()` method

Goal:

Validate the merged existing values plus incoming patch before persisting.

Suggested approach:

1. Load the existing SLA config by `id`.
2. Merge existing `responseTimeMinutes` / `resolutionTimeMinutes` with patch values.
3. Call `assertSlaWindow()` on the merged values.
4. Throw `NotFoundException` if the config does not exist.

Example shape:

```ts
const existing = await this.slaConfigRepository.findById(id);
if (!existing) throw new NotFoundException('SLA config not found');

const responseTimeMinutes =
  data.responseTimeMinutes ?? existing.responseTimeMinutes;
const resolutionTimeMinutes =
  data.resolutionTimeMinutes ?? existing.resolutionTimeMinutes;

this.assertSlaWindow(responseTimeMinutes, resolutionTimeMinutes);
```

Verification:

```bash
cd backend
npm test -- --runInBand
npx tsc --noEmit -p tsconfig.json
```

### Task 4 - Fix Office file MIME validation

Severity: Medium

Files:

- `backend/src/common/utils/mime-validation.util.ts`
- Relevant upload tests or new focused tests

Problem:

Frontend and backend allow Office MIME types, but backend magic-byte validation can reject valid files:

- `.docx` / `.xlsx` are ZIP containers, detected as `application/zip`
- legacy Office files may be detected as `application/msword`

Goal:

Allow valid Office container signatures while still rejecting obvious MIME spoofing.

Suggested approach:

Add a compatibility map in `assertMimeTypeIntegrity()`:

- `application/zip` is compatible with OOXML MIME types.
- OLE CFB signature is compatible with `application/msword` and possibly `application/vnd.ms-excel`.

Verification:

```bash
cd backend
npm test -- --runInBand
npx tsc --noEmit -p tsconfig.json
```

### Task 5 - Bound WebSocket sessions to access-token expiry

Severity: Medium

Files:

- `backend/src/notifications/notifications.gateway.ts`
- `frontend/src/hooks/use-socket.ts` only if reconnect/auth refresh behavior needs adjustment

Problem:

The notification gateway verifies the JWT only when a socket connects. A socket can remain connected after access-token expiry.

Goal:

Disconnect or re-authenticate sockets when the token expires.

Suggested approach:

1. After verifying JWT payload, read `payload.exp`.
2. If already expired, disconnect.
3. Schedule disconnect at expiry time.
4. Clear timers on disconnect.

Verification:

```bash
cd backend
npm test -- --runInBand
npx tsc --noEmit -p tsconfig.json
```

Add a focused gateway unit test if practical.

## Additional Medium Tasks

### Task 6 - Strengthen backend DTO validation for blank text

Files:

- `backend/src/tickets/dto/create-ticket.dto.ts`
- `backend/src/comments/dto/create-comment.dto.ts`

Problem:

Direct API clients can send whitespace-only ticket subjects/descriptions or comments. Frontend prevents this, backend does not fully enforce it.

Goal:

Trim string inputs and require non-empty meaningful text.

Suggested approach:

- Add `@Transform()` trim helpers.
- Add `@IsNotEmpty()`.
- Add sensible `@MinLength()` constraints matching frontend behavior where appropriate.

Verification:

```bash
cd backend
npm test -- --runInBand
npx tsc --noEmit -p tsconfig.json
```

### Task 7 - Make TelegramConfig singleton access atomic

Files:

- `backend/src/common/repositories/telegram-config.repository.ts`
- `backend/prisma/schema.prisma` only if schema changes are needed

Problem:

The schema has `key @unique @default("default")`, but the repository uses `findFirst()` then `create()`. This can race under concurrent startup/config access.

Goal:

Always access the singleton by `key = "default"` and use `upsert()`.

Suggested approach:

- Replace `findFirst()` with `findUnique({ where: { key: 'default' } })`.
- Replace `findOrCreate()` with an upsert on the key.

Verification:

```bash
cd backend
npm test -- --runInBand
npx tsc --noEmit -p tsconfig.json
```

### Task 8 - Preserve user visibility for failed initial attachment uploads

Files:

- `frontend/src/components/tickets/CreateTicketForm.tsx`

Problem:

When creating a ticket with attachments, upload failures are stored in local state and then the component immediately navigates away to the ticket detail page.

Goal:

Make upload failure visible to the user.

Suggested approach:

- Show `toast.error()` before navigating, or
- Stop navigation when any upload fails and let the user retry.

Verification:

```bash
cd frontend
npm test
npm run lint
npx tsc --noEmit -p tsconfig.json
```

### Task 9 - Clarify production vs local compose env

Files:

- `backend/.env.compose.example`
- `README.md` or deployment docs if appropriate
- `nginx/nginx.conf` only if TLS flow is intentionally changed

Problem:

The compose example uses `NODE_ENV=production` and `COOKIE_SECURE=true`, but the included nginx config serves HTTP only. Secure refresh cookies will not work over plain HTTP.

Goal:

Make local HTTP and production HTTPS configuration unambiguous.

Suggested approach:

- Split example files or clearly document:
  - local HTTP compose: `NODE_ENV=development`, `COOKIE_SECURE=false`
  - production HTTPS reverse proxy: `NODE_ENV=production`, `COOKIE_SECURE=true`
- Do not change Docker/HTTP/HTTPS flow unless explicitly requested.

Verification:

Documentation-only unless config behavior changes.

### Task 10 - Wire dashboard cache invalidation

Files:

- `backend/src/dashboard/dashboard.service.ts`
- Ticket mutation/event flow:
  - `backend/src/tickets/tickets.service.ts`
  - possibly dashboard listener/module files if adding event listener

Problem:

`DashboardService.invalidateCache()` exists but is not called. Dashboard stats may remain stale until Redis TTL expires.

Goal:

Invalidate dashboard cache after ticket create/status/assignment/priority/delete operations.

Suggested approach:

- Prefer event-driven invalidation using existing `EventEmitter2`.
- Avoid tight coupling if a local pattern already exists.

Verification:

```bash
cd backend
npm test -- --runInBand
npx tsc --noEmit -p tsconfig.json
```

## Suggested Tests To Add

Backend:

- SLA partial update cannot make resolution time less than response time.
- Valid docx/xlsx upload MIME signatures are accepted.
- Whitespace-only ticket/comment payloads are rejected.
- Telegram config singleton handles repeated/concurrent find-or-create.
- WebSocket connections disconnect at JWT expiry.

Frontend:

- ProtectedRoute refresh failure uses correct axios mock.
- Notifications hook returns paginated shape.
- Ticket creation with failed attachment upload surfaces an error.
- Admin/EndUser route and action visibility remains role-gated.

## Production Readiness Gate

Do not call this project production-ready until:

1. Backend production dependency audit has no high-severity findings.
2. Frontend tests pass.
3. SLA partial update validation is fixed.
4. Upload MIME validation matches advertised allowed file types.
5. Deployment docs/config clearly distinguish HTTP local dev from HTTPS production.

