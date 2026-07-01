# Review Fixes — Batch 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Important findings from the July 2026 project review: JWT verification hardening, ticket-access test coverage, SLA/export behavior consistency, frontend cache/error UX, production env hardening, manual backup lock safety, and repo-health cleanup.

**Architecture:** Keep changes narrow and aligned with existing patterns. Backend fixes stay inside existing services/repositories/utilities, frontend fixes stay in hooks/pages, ops fixes update existing scripts/config/docs only. Each task is independently testable and should be reviewed before moving to the next task.

**Tech Stack:** NestJS 10, Prisma 5, Redis 7, React 18, Vite 5, TanStack Query 5, Zustand, Jest, Vitest, Docker Compose, Bash.

## Global Constraints

- No new runtime dependencies.
- Preserve access-token memory-only behavior; do not persist auth tokens in `localStorage`, `sessionStorage`, or other persistent storage.
- Do not add hardcoded fallbacks for `JWT_SECRET`, `DATABASE_URL`, or `REDIS_URL`.
- Backend services should continue using repositories; do not inject `PrismaService` into new service code.
- API success envelope stays `{ data, meta? }`; paginated `meta` must include `totalPages`.
- Telegram secrets must not be returned to frontend.
- Do not run destructive Docker commands such as `docker compose down -v`.
- Do not commit unless the user explicitly requests commits. If commits are requested, make one logical commit per task using the commit messages listed below.
- Verification commands should be run from the exact workdir shown in each task.

---

### Task 1: Pin JWT verification to HS256 everywhere

**Files:**
- Modify: `backend/src/auth/auth.service.ts:64-69`, `backend/src/auth/auth.service.ts:110-115`
- Modify: `backend/src/notifications/notifications.gateway.ts:54-56`
- Modify: `backend/src/notifications/notifications.module.ts:9-12`
- Test: `backend/src/auth/auth.service.spec.ts`
- Test: `backend/src/notifications/__tests__/notifications.gateway.spec.ts`

**Interfaces:**
- Consumes: `JwtService.verify(token, options)` from `@nestjs/jwt`.
- Produces: All manual JWT verification paths use `{ secret: process.env.JWT_SECRET!, algorithms: ['HS256'] }`.

- [ ] **Step 1: Add failing assertions for refresh-token verification options**

In `backend/src/auth/auth.service.spec.ts`, update `refresh() should accept valid refresh token with tokenType=refresh and valid Redis entry` by adding a spy before calling `service.refresh(token)` and an assertion after the call:

```typescript
const verifySpy = jest.spyOn(jwtService, 'verify');

const result = await service.refresh(token);

expect(verifySpy).toHaveBeenCalledWith(token, {
  secret: process.env.JWT_SECRET!,
  algorithms: ['HS256'],
});
```

The full middle section of that test should become:

```typescript
const token = jwtService.sign(payload, { expiresIn: '7d' });
redisService.eval.mockResolvedValue(token);
usersService.findById.mockResolvedValue(mockUser);
const verifySpy = jest.spyOn(jwtService, 'verify');

const result = await service.refresh(token);

expect(verifySpy).toHaveBeenCalledWith(token, {
  secret: process.env.JWT_SECRET!,
  algorithms: ['HS256'],
});
expect(result).toHaveProperty('accessToken');
```

- [ ] **Step 2: Add failing assertions for refresh-token revocation verification options**

In `backend/src/auth/auth.service.spec.ts`, update `revokeRefreshToken() should delete Redis key for valid refresh token`:

```typescript
const token = jwtService.sign(payload, { expiresIn: '7d' });
const verifySpy = jest.spyOn(jwtService, 'verify');

await service.revokeRefreshToken(token);

expect(verifySpy).toHaveBeenCalledWith(token, {
  secret: process.env.JWT_SECRET!,
  algorithms: ['HS256'],
});
expect(redisService.del).toHaveBeenCalledWith('refresh:user-1:revoke-jti');
```

- [ ] **Step 3: Add failing gateway test assertion for access-token verification options**

In `backend/src/notifications/__tests__/notifications.gateway.spec.ts`:

1. Add this to `beforeEach` before compiling the module:

```typescript
process.env.JWT_SECRET = 'test-secret-key-for-gateway-unit-tests-1234';
```

2. Add this to `afterEach`:

```typescript
delete process.env.JWT_SECRET;
```

3. In `should join user room when valid`, add:

```typescript
expect(jwtService.verify).toHaveBeenCalledWith('valid-token', {
  secret: process.env.JWT_SECRET!,
  algorithms: ['HS256'],
});
```

- [ ] **Step 4: Run failing targeted tests**

Run from `backend/`:

```bash
npm test -- auth.service.spec.ts notifications.gateway.spec.ts --runInBand
```

Expected before implementation: tests fail because `algorithms: ['HS256']` is missing from one or more `verify()` calls.

- [ ] **Step 5: Implement HS256 pinning in `AuthService`**

In `backend/src/auth/auth.service.ts`, change both manual `verify()` calls.

Refresh path:

```typescript
payload = this.jwtService.verify(refreshToken, {
  secret: process.env.JWT_SECRET!,
  algorithms: ['HS256'],
});
```

Revocation path:

```typescript
payload = this.jwtService.verify(refreshToken, {
  secret: process.env.JWT_SECRET!,
  algorithms: ['HS256'],
});
```

- [ ] **Step 6: Implement HS256 pinning in notifications gateway/module**

In `backend/src/notifications/notifications.gateway.ts`, change token verification to:

```typescript
const payload = this.jwtService.verify<JwtPayload>(token, {
  secret: process.env.JWT_SECRET!,
  algorithms: ['HS256'],
});
```

In `backend/src/notifications/notifications.module.ts`, change the factory to:

```typescript
useFactory: () => ({
  secret: process.env.JWT_SECRET!,
  signOptions: { algorithm: 'HS256' },
  verifyOptions: { algorithms: ['HS256'] },
}),
```

- [ ] **Step 7: Verify targeted tests pass**

Run from `backend/`:

```bash
npm test -- auth.service.spec.ts notifications.gateway.spec.ts --runInBand
```

Expected: both suites pass.

- [ ] **Step 8: Verify backend build**

Run from `backend/`:

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 9: Commit if explicitly requested**

```bash
git add backend/src/auth/auth.service.ts backend/src/auth/auth.service.spec.ts backend/src/notifications/notifications.gateway.ts backend/src/notifications/notifications.module.ts backend/src/notifications/__tests__/notifications.gateway.spec.ts
git commit -m "fix(security): pin JWT verification algorithms"
```

---

### Task 2: Replace skipped TicketRepository access-scope placeholder with active tests

**Files:**
- Modify: `backend/src/common/repositories/__tests__/ticket.repository.spec.ts:41-48`

**Interfaces:**
- Consumes: `buildTicketAccessWhere(scope, where)`, `TicketRepository.findManyForUser(args, scope)`, `TicketRepository.countForUser(where, scope)`.
- Produces: Active unit coverage proving EndUser scoping is applied in repository methods.

- [ ] **Step 1: Replace skipped block with active tests**

In `backend/src/common/repositories/__tests__/ticket.repository.spec.ts`, replace lines 41-48 with:

```typescript
describe('findManyForUser/countForUser access scope', () => {
  it('should force EndUser queries to requesterId even if caller passes another requesterId', () => {
    const result = buildTicketAccessWhere(
      { userId: 'end-user-1', role: 'EndUser' },
      { status: 'Open', requesterId: 'malicious-user' },
    );

    expect(result).toEqual({
      status: 'Open',
      requesterId: 'end-user-1',
    });
  });

  it('should leave ITSupport query filters unchanged', () => {
    const where = { status: 'Open', assignedToId: 'support-1' };

    const result = buildTicketAccessWhere(
      { userId: 'support-1', role: 'ITSupport' },
      where,
    );

    expect(result).toBe(where);
  });

  it('should scope findManyForUser for EndUser before calling Prisma', async () => {
    prisma.ticket.findMany.mockResolvedValueOnce([{ id: 'ticket-1' }]);

    const result = await repository.findManyForUser(
      { where: { priority: 'High' }, take: 10 },
      { userId: 'end-user-1', role: 'EndUser' },
    );

    expect(result).toEqual([{ id: 'ticket-1' }]);
    expect(prisma.ticket.findMany).toHaveBeenCalledWith({
      where: { priority: 'High', requesterId: 'end-user-1' },
      take: 10,
    });
  });

  it('should scope countForUser for EndUser before calling Prisma', async () => {
    prisma.ticket.count.mockResolvedValueOnce(3);

    const result = await repository.countForUser(
      { status: 'Open' },
      { userId: 'end-user-1', role: 'EndUser' },
    );

    expect(result).toBe(3);
    expect(prisma.ticket.count).toHaveBeenCalledWith({
      where: { status: 'Open', requesterId: 'end-user-1' },
    });
  });
});
```

- [ ] **Step 2: Run targeted repository tests**

Run from `backend/`:

```bash
npm test -- ticket.repository.spec.ts --runInBand
```

Expected: suite passes with no skipped placeholder in this file.

- [ ] **Step 3: Confirm no skipped backend tests remain**

Run from repo root:

```bash
rg "it\.skip|describe\.skip|test\.skip|\.skip\(" backend/src --glob "*.spec.ts"
```

Expected: no output. If output remains outside this file, stop and report it before changing unrelated tests.

- [ ] **Step 4: Commit if explicitly requested**

```bash
git add backend/src/common/repositories/__tests__/ticket.repository.spec.ts
git commit -m "test: cover ticket repository access scoping"
```

---

### Task 3: Reuse SLAService fallback logic when updating ticket priority

**Files:**
- Modify: `backend/src/tickets/tickets.service.ts:450-477`
- Test: `backend/src/tickets/tickets.service.spec.ts`

**Interfaces:**
- Consumes: `SLAService.getSLAConfig(categoryId: string, priority: Priority)`.
- Produces: `TicketsService.updatePriority()` computes `slaDueAt` and `slaStatus` with the same SLA fallback semantics as ticket creation.

- [ ] **Step 1: Add failing updatePriority regression test**

In `backend/src/tickets/tickets.service.spec.ts`, add this `describe` block before the final closing `});` of the top-level `describe('TicketsService', ...)`:

```typescript
describe('updatePriority', () => {
  const ticketId = 'ticket-1';
  const userId = 'admin-1';
  const createdAt = new Date('2026-06-18T12:00:00Z');
  const now = new Date('2026-06-18T12:10:00Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should use SLAService fallback config instead of hardcoded 24h when exact priority config is absent', async () => {
    const existingTicket = {
      id: ticketId,
      ticketNumber: 'TKT-001',
      priority: Priority.Low,
      categoryId: 'cat-1',
      createdAt,
      category: { slaConfigs: [] },
    };
    const fallbackConfig = {
      id: 'sla-fallback',
      categoryId: 'cat-1',
      priority: Priority.Medium,
      responseTimeMinutes: 30,
      resolutionTimeMinutes: 60,
      isActive: true,
    };
    const expectedSlaDueAt = new Date(createdAt.getTime() + 60 * 60 * 1000);

    mockTicketRepository.findById.mockResolvedValue(existingTicket);
    mockSlaService.getSLAConfig.mockResolvedValueOnce(fallbackConfig);
    mockTicketRepository.update.mockImplementation(async (_id: string, data: any) => ({
      ...existingTicket,
      ...data,
    }));

    await service.updatePriority(ticketId, { priority: Priority.High }, userId);

    expect(mockSlaService.getSLAConfig).toHaveBeenCalledWith('cat-1', Priority.High);
    expect(mockTicketRepository.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        priority: Priority.High,
        slaDueAt: expectedSlaDueAt,
        slaStatus: SLAStatus.OnTrack,
      }),
    );
  });
});
```

- [ ] **Step 2: Run targeted test and confirm it fails**

Run from `backend/`:

```bash
npm test -- tickets.service.spec.ts --runInBand
```

Expected before implementation: the new test fails because `updatePriority()` does not call `SLAService.getSLAConfig()` and uses a 24h fallback.

- [ ] **Step 3: Implement shared SLA fallback in `updatePriority()`**

In `backend/src/tickets/tickets.service.ts`, replace:

```typescript
const slaConfig = ticket.category.slaConfigs.find(
  (c: any) => c.priority === newPriority,
);
```

with:

```typescript
const slaConfig = await this.slaService.getSLAConfig(
  ticket.categoryId,
  newPriority,
);
```

Keep the existing 24h fallback for the case where `SLAService.getSLAConfig()` returns `null`:

```typescript
const slaDueAt = slaConfig
  ? new Date(createdAt + slaConfig.resolutionTimeMinutes * 60 * 1000)
  : new Date(createdAt + 24 * 60 * 60 * 1000);
```

- [ ] **Step 4: Optionally simplify the ticket include**

If TypeScript/build passes without `ticket.category.slaConfigs`, change the `findById` include from:

```typescript
{
  category: {
    include: {
      slaConfigs: { where: { isActive: true } },
    },
  },
}
```

to:

```typescript
{}
```

If this causes a type/build issue, leave the existing include in place; the behavior fix is the `SLAService.getSLAConfig()` call.

- [ ] **Step 5: Verify targeted test and build**

Run from `backend/`:

```bash
npm test -- tickets.service.spec.ts --runInBand
npm run build
```

Expected: test suite passes and build exits 0.

- [ ] **Step 6: Commit if explicitly requested**

```bash
git add backend/src/tickets/tickets.service.ts backend/src/tickets/tickets.service.spec.ts
git commit -m "fix(tickets): reuse SLA fallback on priority updates"
```

---

### Task 4: Make CSV export honor requested sort field safely

**Files:**
- Modify: `backend/src/tickets/tickets.service.ts:219-272`
- Test: `backend/src/tickets/tickets.service.spec.ts`

**Interfaces:**
- Consumes: `QueryTicketDto.sortBy`, `QueryTicketDto.sortOrder`, `TicketRepository.findManyForUser(args, scope)`.
- Produces: CSV export uses the same allowed sort fields as ticket list, with deterministic `id` secondary sort.

- [ ] **Step 1: Add failing CSV sort test**

In `backend/src/tickets/tickets.service.spec.ts`, add this `describe` block before the final closing `});` of the top-level describe. If Task 3 already added an `updatePriority` block near the end, place this block before or after it.

```typescript
describe('exportCsvToResponse', () => {
  function makeResponse() {
    return {
      write: jest.fn(),
      end: jest.fn(),
    } as any;
  }

  it('should honor allowed sortBy and sortOrder with id as deterministic secondary sort', async () => {
    const res = makeResponse();
    mockTicketRepository.findManyForUser.mockResolvedValueOnce([
      {
        id: 'ticket-1',
        ticketNumber: 'TKT-001',
        subject: 'VPN issue',
        status: TicketStatus.Open,
        priority: Priority.High,
        category: { name: 'Network' },
        subCategory: null,
        requester: { name: 'Requester' },
        assignedTo: null,
        createdAt: new Date('2026-06-18T12:00:00Z'),
        resolvedAt: null,
        slaStatus: SLAStatus.OnTrack,
      },
    ]).mockResolvedValueOnce([]);

    await service.exportCsvToResponse(
      res,
      { sortBy: 'priority', sortOrder: 'asc' },
      'Admin',
      'admin-1',
    );

    expect(mockTicketRepository.findManyForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ priority: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 500,
      }),
      { userId: 'admin-1', role: 'Admin' },
    );
    expect(res.end).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run targeted test and confirm it fails**

Run from `backend/`:

```bash
npm test -- tickets.service.spec.ts --runInBand
```

Expected before implementation: the new test fails because export orders by `{ id: 'asc' }` only and does not pass `skip`.

- [ ] **Step 3: Replace cursor-by-id export loop with offset batches and dynamic orderBy**

In `backend/src/tickets/tickets.service.ts`, replace:

```typescript
let cursorId: string | undefined;
let totalExported = 0;
const scope: TicketAccessScope = { userId, role: userRole as TicketAccessScope['role'] };

while (totalExported < MAX_EXPORT_ROWS) {
  const cursorWhere = cursorId ? { ...where, id: { [orderDir === 'asc' ? 'gt' : 'lt']: cursorId } } : where;

  const batch = await this.ticketRepository.findManyForUser({
    where: cursorWhere as any,
    orderBy: { id: orderDir === 'asc' ? 'asc' : 'desc' },
    take: BATCH_SIZE,
    include: {
```

with:

```typescript
let totalExported = 0;
let offset = 0;
const scope: TicketAccessScope = { userId, role: userRole as TicketAccessScope['role'] };
const orderBy = [
  { [orderField]: orderDir },
  { id: orderDir },
];

while (totalExported < MAX_EXPORT_ROWS) {
  const batch = await this.ticketRepository.findManyForUser({
    where: where as any,
    orderBy: orderBy as any,
    skip: offset,
    take: Math.min(BATCH_SIZE, MAX_EXPORT_ROWS - totalExported),
    include: {
```

Then replace the loop tail:

```typescript
cursorId = batch[batch.length - 1].id;
if (batch.length < BATCH_SIZE) break;
```

with:

```typescript
offset += batch.length;
if (batch.length < BATCH_SIZE) break;
```

- [ ] **Step 4: Verify CSV export test and backend build**

Run from `backend/`:

```bash
npm test -- tickets.service.spec.ts --runInBand
npm run build
```

Expected: test suite passes and build exits 0.

- [ ] **Step 5: Commit if explicitly requested**

```bash
git add backend/src/tickets/tickets.service.ts backend/src/tickets/tickets.service.spec.ts
git commit -m "fix(tickets): honor CSV export sorting"
```

---

### Task 5: Make role-sensitive category queries use role-aware cache keys

**Files:**
- Modify: `frontend/src/hooks/use-categories.ts`
- Test: `frontend/src/hooks/__tests__/use-categories.test.tsx` (new)

**Interfaces:**
- Consumes: `useAuthStore((s) => s.user?.role)`.
- Produces: Category list/detail query keys include current role so Admin full-shape data and EndUser/ITSupport minimal-shape data do not share a stale cache entry.

- [ ] **Step 1: Create failing hook test**

Create `frontend/src/hooks/__tests__/use-categories.test.tsx` with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useCategories, useCategory } from '../use-categories';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
  },
  unwrapData: vi.fn((res) => res.data.data),
}));

const mockGet = vi.mocked((await import('@/lib/axios')).default.get);

const createQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useCategories role-aware cache keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().logout();
  });

  it('should keep category list caches separate by role', async () => {
    const queryClient = createQueryClient();
    mockGet
      .mockResolvedValueOnce({ data: { data: [{ id: 'cat-1', name: 'Minimal' }] } })
      .mockResolvedValueOnce({ data: { data: [{ id: 'cat-1', name: 'Full', _count: { tickets: 1 } }] } });

    useAuthStore.getState().login({ id: 'user-1', email: 'user@test.com', name: 'User', role: 'EndUser', isActive: true }, 'token-1');
    const first = renderHook(() => useCategories(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(first.result.current.data?.[0]?.name).toBe('Minimal'));

    useAuthStore.getState().login({ id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'Admin', isActive: true }, 'token-2');
    const second = renderHook(() => useCategories(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(second.result.current.data?.[0]?.name).toBe('Full'));

    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('should keep category detail caches separate by role', async () => {
    const queryClient = createQueryClient();
    mockGet
      .mockResolvedValueOnce({ data: { data: { id: 'cat-1', name: 'Minimal' } } })
      .mockResolvedValueOnce({ data: { data: { id: 'cat-1', name: 'Full', _count: { tickets: 1 } } } });

    useAuthStore.getState().login({ id: 'user-1', email: 'user@test.com', name: 'User', role: 'EndUser', isActive: true }, 'token-1');
    const first = renderHook(() => useCategory('cat-1'), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(first.result.current.data?.name).toBe('Minimal'));

    useAuthStore.getState().login({ id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'Admin', isActive: true }, 'token-2');
    const second = renderHook(() => useCategory('cat-1'), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(second.result.current.data?.name).toBe('Full'));

    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run failing frontend hook test**

Run from `frontend/`:

```bash
npm test -- src/hooks/__tests__/use-categories.test.tsx --run
```

Expected before implementation: tests fail because both roles share `['categories']` and `['category', id]` keys.

- [ ] **Step 3: Implement role-aware query keys**

In `frontend/src/hooks/use-categories.ts`, add the auth-store import:

```typescript
import { useAuthStore } from '@/stores/auth-store';
```

Change `useCategories()` to:

```typescript
export function useCategories() {
  const role = useAuthStore((s) => s.user?.role ?? 'anonymous');

  return useQuery({
    queryKey: ['categories', role],
    staleTime: STALE_TIME_CATEGORIES,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Category[]>>('/categories');
      return unwrapData(response);
    },
  });
}
```

Change `useCategory(id: string)` to:

```typescript
export function useCategory(id: string) {
  const role = useAuthStore((s) => s.user?.role ?? 'anonymous');

  return useQuery({
    queryKey: ['category', role, id],
    staleTime: STALE_TIME_CATEGORIES,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Category>>(`/categories/${id}`);
      return unwrapData(response);
    },
    enabled: !!id,
  });
}
```

- [ ] **Step 4: Verify frontend tests, lint, and build**

Run from `frontend/`:

```bash
npm test -- src/hooks/__tests__/use-categories.test.tsx --run
npm run lint
npm run build
```

Expected: targeted test passes, lint passes, build exits 0.

- [ ] **Step 5: Commit if explicitly requested**

```bash
git add frontend/src/hooks/use-categories.ts frontend/src/hooks/__tests__/use-categories.test.tsx
git commit -m "fix(frontend): use role-aware category query keys"
```

---

### Task 6: Show notification load errors and use backend totalPages

**Files:**
- Modify: `frontend/src/pages/NotificationsPage.tsx`
- Test: `frontend/src/pages/__tests__/NotificationsPage.test.tsx` (new)

**Interfaces:**
- Consumes: `useNotifications(page, limit)` return fields `isLoading`, `isError`, `error`, `refetch`, `data.meta.totalPages`.
- Produces: Notifications page shows an error state instead of “No notifications” when the query fails, and pagination uses backend `meta.totalPages`.

- [ ] **Step 1: Create failing page tests**

Create `frontend/src/pages/__tests__/NotificationsPage.test.tsx` with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationsPage from '../NotificationsPage';

const mockUseNotifications = vi.fn();

vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: (...args: unknown[]) => mockUseNotifications(...args),
  useMarkAsRead: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkAllAsRead: () => ({ mutate: vi.fn(), isPending: false }),
  useClearAll: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/components/ui/Pagination', () => ({
  default: ({ totalPages }: { totalPages: number }) => <div data-testid="pagination">pages:{totalPages}</div>,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show an error state when notifications fail to load', () => {
    mockUseNotifications.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network failed'),
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Failed to load notifications')).toBeInTheDocument();
    expect(screen.getByText('Network failed')).toBeInTheDocument();
    expect(screen.queryByText('No notifications')).not.toBeInTheDocument();
  });

  it('should use meta.totalPages from the backend for pagination', () => {
    mockUseNotifications.mockReturnValue({
      data: {
        data: [{ id: 'n1', title: 'Ticket updated', message: 'A ticket changed', isRead: true, createdAt: '2026-06-18T12:00:00Z' }],
        meta: { page: 1, limit: 20, total: 999, totalPages: 7 },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByTestId('pagination')).toHaveTextContent('pages:7');
  });
});
```

- [ ] **Step 2: Run failing page tests**

Run from `frontend/`:

```bash
npm test -- src/pages/__tests__/NotificationsPage.test.tsx --run
```

Expected before implementation: tests fail because `NotificationsPage` does not read `isError/error/refetch` and computes `totalPages` locally.

- [ ] **Step 3: Implement error state and backend totalPages**

In `frontend/src/pages/NotificationsPage.tsx`, add imports:

```typescript
import ErrorMessage from '@/components/ui/ErrorMessage';
import { getErrorMessage } from '@/lib/utils';
```

Change the hook destructuring from:

```typescript
const { data: notifData, isLoading } = useNotifications(page, limit);
```

to:

```typescript
const { data: notifData, isLoading, isError, error, refetch } = useNotifications(page, limit);
```

After the loading return block, add:

```typescript
if (isError) {
  return (
    <div className="card">
      <ErrorMessage
        title="Failed to load notifications"
        message={getErrorMessage(error, 'Unable to load notifications. Please try again.')}
        onRetry={() => refetch()}
      />
    </div>
  );
}
```

Change pagination from:

```typescript
totalPages={Math.ceil(meta.total / limit) || 1}
```

to:

```typescript
totalPages={meta.totalPages}
```

- [ ] **Step 4: Verify frontend tests, lint, and build**

Run from `frontend/`:

```bash
npm test -- src/pages/__tests__/NotificationsPage.test.tsx --run
npm run lint
npm run build
```

Expected: targeted test passes, lint passes, build exits 0.

- [ ] **Step 5: Commit if explicitly requested**

```bash
git add frontend/src/pages/NotificationsPage.tsx frontend/src/pages/__tests__/NotificationsPage.test.tsx
git commit -m "fix(frontend): show notification load errors"
```

---

### Task 7: Extract startup env validation and reject HTTP CORS origins in production

**Files:**
- Create: `backend/src/common/utils/env-validation.util.ts`
- Create: `backend/src/common/utils/__tests__/env-validation.util.spec.ts`
- Modify: `backend/src/main.ts:9-63`

**Interfaces:**
- Produces: `validateStartupEnv(env?: NodeJS.ProcessEnv): void` and `getCorsOrigins(env?: NodeJS.ProcessEnv): string[]`.
- Consumes: `main.ts` calls those helpers during bootstrap.

- [ ] **Step 1: Create failing env-validation tests**

Create `backend/src/common/utils/__tests__/env-validation.util.spec.ts` with:

```typescript
import { getCorsOrigins, validateStartupEnv } from '../env-validation.util';

describe('env-validation.util', () => {
  const baseEnv = {
    JWT_SECRET: 'strong-production-secret-value-1234567890',
    DATABASE_URL: 'postgresql://user:pass@db:5432/app',
    REDIS_URL: 'redis://:pass@cache:6379',
    REDIS_PASSWORD: 'redis-pass',
    COOKIE_SECURE: 'true',
  } as NodeJS.ProcessEnv;

  it('should parse comma-separated CORS origins and drop empty entries', () => {
    expect(getCorsOrigins({ CORS_ORIGIN: ' https://a.test,https://b.test, ' } as NodeJS.ProcessEnv)).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });

  it('should default CORS origin to the internal helpdesk HTTPS origin', () => {
    expect(getCorsOrigins({} as NodeJS.ProcessEnv)).toEqual(['https://helpdesk.rsmch.internal']);
  });

  it('should reject HTTP CORS origins in production', () => {
    expect(() => validateStartupEnv({
      ...baseEnv,
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://helpdesk.rsmch.internal,http://evil.test',
    })).toThrow('CORS_ORIGIN must use https:// in production');
  });

  it('should allow HTTP CORS origins outside production for local Docker development', () => {
    expect(() => validateStartupEnv({
      ...baseEnv,
      NODE_ENV: 'development',
      COOKIE_SECURE: 'false',
      CORS_ORIGIN: 'http://helpdesk.rsmch.internal',
    })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run failing env-validation test**

Run from `backend/`:

```bash
npm test -- env-validation.util.spec.ts --runInBand
```

Expected before implementation: test fails because `env-validation.util.ts` does not exist.

- [ ] **Step 3: Implement env-validation utility**

Create `backend/src/common/utils/env-validation.util.ts`:

```typescript
const DEFAULT_CORS_ORIGIN = 'https://helpdesk.rsmch.internal';

export function getCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.CORS_ORIGIN || DEFAULT_CORS_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function validateStartupEnv(env: NodeJS.ProcessEnv = process.env): void {
  const required = ['JWT_SECRET', 'DATABASE_URL', 'REDIS_URL'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  if (env.NODE_ENV?.toLowerCase() === 'production') {
    const jwtSecret = env.JWT_SECRET || '';
    const weakSecrets = [
      'your-super-secret-jwt-key-change-in-production',
      'change-this-to-random-secret',
      'secret',
      'changeme',
      'password',
    ];
    if (weakSecrets.includes(jwtSecret.toLowerCase().trim())) {
      throw new Error(
        'JWT_SECRET is too weak for production. Please set a strong, unique secret.',
      );
    }
    if (jwtSecret.length < 32) {
      throw new Error(
        'JWT_SECRET must be at least 32 characters in production.',
      );
    }
    if (!env.REDIS_PASSWORD) {
      throw new Error('REDIS_PASSWORD is required in production.');
    }
    if (env.COOKIE_SECURE !== 'true') {
      throw new Error(
        'COOKIE_SECURE must be "true" in production. Set to "false" only for local HTTP development.',
      );
    }

    const insecureOrigins = getCorsOrigins(env).filter(
      (origin) => !origin.startsWith('https://'),
    );
    if (insecureOrigins.length > 0) {
      throw new Error(
        `CORS_ORIGIN must use https:// in production. Invalid origins: ${insecureOrigins.join(', ')}`,
      );
    }
  }
}
```

- [ ] **Step 4: Wire utility into `main.ts`**

In `backend/src/main.ts`:

1. Add import:

```typescript
import { getCorsOrigins, validateStartupEnv } from './common/utils/env-validation.util';
```

2. Delete the local `validateEnv()` function.

3. Change bootstrap start from:

```typescript
validateEnv();
```

to:

```typescript
validateStartupEnv();
```

4. Change CORS origin setup from:

```typescript
const corsOrigin = process.env.CORS_ORIGIN || 'https://helpdesk.rsmch.internal';
app.enableCors({
  origin: corsOrigin.split(',').map((o) => o.trim()),
```

to:

```typescript
app.enableCors({
  origin: getCorsOrigins(),
```

- [ ] **Step 5: Verify env-validation test and backend build**

Run from `backend/`:

```bash
npm test -- env-validation.util.spec.ts --runInBand
npm run build
```

Expected: test passes and build exits 0.

- [ ] **Step 6: Commit if explicitly requested**

```bash
git add backend/src/main.ts backend/src/common/utils/env-validation.util.ts backend/src/common/utils/__tests__/env-validation.util.spec.ts
git commit -m "fix(config): reject insecure production CORS origins"
```

---

### Task 8: Make manual backup script respect Redis backup/restore locks

**Files:**
- Modify: `scripts/backup.sh`

**Interfaces:**
- Consumes Redis keys used by `MaintenanceService`: `maintenance:enabled`, `maintenance:backup:lock`, `maintenance:restore:lock`.
- Produces: Manual backup refuses to run during active API restore/backup and acquires/releases `maintenance:backup:lock` while running.

- [ ] **Step 1: Add reusable Redis CLI helper**

In `scripts/backup.sh`, after `cd "$ROOT_DIR"`, add:

```bash
redis_cli() {
  docker compose exec -T cache sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli "$@"' sh "$@"
}
```

- [ ] **Step 2: Replace direct maintenance Redis call with helper**

Change:

```bash
MAINTENANCE_ENABLED="$(docker compose exec -T cache sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli get maintenance:enabled' | tr -d '\r')"
```

to:

```bash
MAINTENANCE_ENABLED="$(redis_cli get maintenance:enabled | tr -d '\r')"
```

- [ ] **Step 3: Acquire backup lock and refuse active restore/backup**

After the maintenance preflight block and before `mkdir -p "$BACKUP_PATH"`, add:

```bash
RESTORE_LOCK="$(redis_cli get maintenance:restore:lock | tr -d '\r')"
if [ -n "$RESTORE_LOCK" ]; then
  echo "Refusing manual backup because a restore is already in progress." >&2
  exit 1
fi

BACKUP_LOCK_TOKEN="manual-$TIMESTAMP-$$"
BACKUP_LOCK_ACQUIRED="$(redis_cli set maintenance:backup:lock "$BACKUP_LOCK_TOKEN" EX 600 NX | tr -d '\r')"
if [ "$BACKUP_LOCK_ACQUIRED" != "OK" ]; then
  echo "Refusing manual backup because another backup is already in progress." >&2
  exit 1
fi

release_backup_lock() {
  redis_cli eval "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end" 1 maintenance:backup:lock "$BACKUP_LOCK_TOKEN" >/dev/null || true
}
trap release_backup_lock EXIT
```

- [ ] **Step 4: Syntax-check the script**

Run from repo root:

```bash
bash -n scripts/backup.sh
```

Expected: exit 0.

- [ ] **Step 5: Optional live smoke test if Docker stack is running**

Only run this if the Docker stack is already running and user confirms a backup smoke test is acceptable:

```bash
./scripts/backup.sh --live-ok
```

Expected: backup completes or fails with a clear environment/runtime message. Do not start/stop containers just for this task unless the user asks.

- [ ] **Step 6: Commit if explicitly requested**

```bash
git add scripts/backup.sh
git commit -m "fix(ops): lock manual backups against restore races"
```

---

### Task 9: Clean up repo-health drift in scripts, CI, and docs

**Files:**
- Modify: `backend/package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

**Interfaces:**
- Produces: No dead `test:e2e` script, CI no longer allows missing tests, docs match current seed behavior and image choices.

- [ ] **Step 1: Remove broken backend e2e script**

In `backend/package.json`, remove this line:

```json
"test:e2e": "jest --config ./test/jest-e2e.json",
```

Ensure the surrounding JSON remains valid. The scripts block should contain:

```json
"test": "jest",
"prisma:generate": "prisma generate",
```

- [ ] **Step 2: Remove `--passWithNoTests` from CI**

In `.github/workflows/ci.yml`, change backend test step from:

```yaml
- run: npm test -- --passWithNoTests
```

to:

```yaml
- run: npm test
```

Change frontend test step from:

```yaml
- run: npx vitest run --passWithNoTests
```

to:

```yaml
- run: npm test
```

- [ ] **Step 3: Fix README seed behavior drift**

In `README.md`, replace the sentence around the seed section that says existing default users keep their current password in production with:

```markdown
Production containers do not run seed automatically. If the seed script is run manually in production, `SEED_ADMIN_PASSWORD` and `SEED_SUPPORT_PASSWORD` are required and the default admin/support passwords are updated to those values. The sample ticket is skipped when `NODE_ENV=production`.
```

- [ ] **Step 4: Fix ARCHITECTURE Alpine wording drift**

In `ARCHITECTURE.md`, replace broad wording that claims Alpine images are not used with wording that matches the current Dockerfiles/Compose:

```markdown
The API runtime uses a Debian/bookworm-slim Node image to avoid native-module and Prisma engine compatibility issues. Supporting services and the frontend static build/export path intentionally use Alpine-based images where the current Compose/Dockerfiles already specify them (`nginx:alpine`, `postgres:16-alpine`, `redis:7-alpine`, and the frontend builder/runtime image).
```

Apply this replacement to both places where the architecture doc currently overstates Alpine avoidance.

- [ ] **Step 5: Validate package JSON and run focused verification**

Run from repo root:

```bash
node -e "JSON.parse(require('fs').readFileSync('backend/package.json', 'utf8')); console.log('backend/package.json ok')"
```

Run from `backend/`:

```bash
npm test -- --runInBand
npm run build
```

Run from `frontend/`:

```bash
npm test -- --run
npm run lint
npm run build
```

Expected: JSON parse succeeds; backend tests/build pass; frontend tests/lint/build pass.

- [ ] **Step 6: Commit if explicitly requested**

```bash
git add backend/package.json .github/workflows/ci.yml README.md ARCHITECTURE.md
git commit -m "chore: align CI scripts and docs with current project"
```

---

## Final verification after all tasks

Run these from the specified directories after completing every task:

```bash
cd /home/adtywbw/apps/it-support-ticketing/backend && npm test -- --runInBand
cd /home/adtywbw/apps/it-support-ticketing/backend && npm run build
cd /home/adtywbw/apps/it-support-ticketing/frontend && npm test -- --run
cd /home/adtywbw/apps/it-support-ticketing/frontend && npm run lint
cd /home/adtywbw/apps/it-support-ticketing/frontend && npm run build
cd /home/adtywbw/apps/it-support-ticketing && bash -n scripts/backup.sh
cd /home/adtywbw/apps/it-support-ticketing && git status --short
```

Expected:
- Backend tests pass with no skipped tests from `ticket.repository.spec.ts`.
- Backend build exits 0.
- Frontend tests, lint, and build exit 0.
- `bash -n scripts/backup.sh` exits 0.
- `git status --short` shows only intentional modified/created files.

## Recommended execution order

1. Task 1 — security hardening, small blast radius.
2. Task 2 — test gap, no production behavior change.
3. Task 3 — SLA behavior consistency.
4. Task 4 — CSV export behavior consistency.
5. Task 5 — frontend cache correctness.
6. Task 6 — frontend notification error UX.
7. Task 7 — production config hardening.
8. Task 8 — backup script race hardening.
9. Task 9 — CI/docs cleanup.

If time is limited, execute Tasks 1-4 first; they address the highest-value backend/security/behavior findings.
