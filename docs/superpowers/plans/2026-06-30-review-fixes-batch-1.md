# Review Fixes — Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix the three highest-severity findings from the June 2026 project review: backup file permissions, frontend auth cookie/logout cleanup, and SLA Redis lock release safety.

**Architecture:** Three independent, targeted fixes across the NestJS backend (maintenance service, SLA service) and the React frontend (axios client, logout flows).

**Tech Stack:** NestJS 10, Prisma 5, Redis 7, React 18, Zustand, TanStack Query 5.

**Note:** There is no design doc in `docs/superpowers/specs/` — the plan was approved inline during the conversation.

## Global Constraints

- No new dependencies.
- Backend changes follow existing patterns (repository injection, `Logger`, Lua scripts in template strings).
- Frontend uses functional components, named exports.
- Access tokens remain memory-only; refresh tokens stay httpOnly.
- Backend changes must build (`backend/` directory).
- Frontend changes must build and lint (`frontend/` directory).

---

### Task 1: Backup file permissions hardening

**Files:**
- Modify: `backend/src/maintenance/maintenance.service.ts:124-153`
- Test: `backend/src/maintenance/maintenance.service.spec.ts` (add assertions)

**Interfaces:**
- Consumes: `MaintenanceService.createBackup()` — unchanged function signature.
- Produces: Safer file permissions; logged original errors on backup failure.

- [ ] **Step 1: Add explicit mkdir mode and file chmods**

In `createBackup()`, change the following:

```typescript
// Line 125 — existing:
await fs.mkdir(backupPath, { recursive: true });
// Change to:
await fs.mkdir(backupPath, { recursive: true, mode: 0o700 });
```

After `execFileAsync('gzip', ...)` (lines 132-134), add:
```typescript
await fs.chmod(dbSqlPath.replace(/\.sql$/, '.sql.gz'), 0o600);
```

After `execFileAsync('tar', ...)` (lines 136-138), add:
```typescript
await fs.chmod(uploadsPath, 0o600);
```

After `writeFile(manifestPath, ...)` (lines 140-148), add:
```typescript
await fs.chmod(manifestPath, 0o600);
```

- [ ] **Step 2: Log original error on backup failure**

Change line 149 from:
```typescript
} catch {
  await fs.rm(backupPath, { recursive: true, force: true });
  throw new BadRequestException('Backup failed. See server logs for details.');
}
```
to:
```typescript
} catch (error) {
  this.logger.error(`Backup failed: ${(error as Error).message}`, (error as Error).stack);
  await fs.rm(backupPath, { recursive: true, force: true });
  throw new BadRequestException('Backup failed. See server logs for details.');
}
```

- [ ] **Step 3: Verify backend builds**

Run:
```bash
cd /home/adtywbw/apps/it-support-ticketing/backend && npm run build
```
Expected: exit 0, no errors.

- [ ] **Step 4: Run backend unit tests**

Run:
```bash
cd /home/adtywbw/apps/it-support-ticketing/backend && npm test
```
Expected: all tests pass. Note: `maintenance.service.spec.ts` may already cover backup paths — verify assertions don't break.

- [ ] **Step 5: Commit**

```bash
git add backend/src/maintenance/maintenance.service.ts
git commit -m "fix: harden backup file permissions and log original errors"
```

---

### Task 2: SLA Redis lock release with compare-and-delete

**Files:**
- Modify: `backend/src/sla/sla.service.ts:112-130`

**Interfaces:**
- Consumes: `RedisService.eval(script, keys, args)` — already used elsewhere.
- Produces: `checkSLA()` releases lock atomically only when token matches.

- [ ] **Step 1: Add `RELEASE_LOCK_SCRIPT` constant and change lock release**

At the class level in `SLAService` (e.g., after field declarations), add:

```typescript
private static readonly RELEASE_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  else
    return 0
  end
`;
```

Change lines 127-128 from:
```typescript
} finally {
  await this.redisService.del(lockKey);
}
```
to:
```typescript
} finally {
  await this.redisService.eval(
    SLAService.RELEASE_LOCK_SCRIPT,
    [lockKey],
    [lockToken],
  );
}
```

If `eval` is not exposed on `RedisService` in the same way as `get`, `set`, `setNx`, `del` — verify first. From existing usage in `MaintenanceService.releaseLock()` (line 67-71), the pattern `this.redis.eval(script, [keys...], [args...])` is confirmed.

- [ ] **Step 2: Verify backend builds**

```bash
cd /home/adtywbw/apps/it-support-ticketing/backend && npm run build
```
Expected: exit 0.

- [ ] **Step 3: Run backend unit tests**

```bash
cd /home/adtywbw/apps/it-support-ticketing/backend && npm test
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/sla/sla.service.ts
git commit -m "fix: use compare-and-delete Lua for SLA cron lock release"
```

---

### Task 3: Frontend auth cookie handling and server-backed logout

**Files:**
- Modify: `frontend/src/lib/axios.ts:8-10`
- Modify: `frontend/src/hooks/use-auth.ts:16` (verify no additional change needed)
- Modify: `frontend/src/pages/MyAccountPage.tsx:113-117`
- Modify: `frontend/src/pages/AdminMaintenancePage.tsx:103-106`

**Interfaces:**
- Consumes: `apiClient` (axios), `useAuthStore.logout()`, `useLogout()` mutation.
- Produces: Login/logout send credentials; password-change/restore clear server-side refresh cookie.

- [ ] **Step 1: Set `withCredentials: true` on shared apiClient**

In `frontend/src/lib/axios.ts`, change line 8-10 from:
```typescript
const apiClient = axios.create({
  baseURL: API_BASE_URL,
});
```
to:
```typescript
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});
```

This ensures login, logout, and all authenticated requests send cookies. The refresh endpoint already uses explicit `{ withCredentials: true }` in its standalone axios call — that stays as-is for the interceptor refresh path.

- [ ] **Step 2: Verify `useLogin` and `useLogout` already use `apiClient`**

Check `frontend/src/hooks/use-auth.ts`:
- Line 16: `await apiClient.post<ApiEnvelope<AuthResponse>>('/auth/login', credentials)` — uses `apiClient`, good. With `withCredentials: true` on `apiClient`, the refresh cookie will be set properly on login.
- Line 41: `await apiClient.post('/auth/logout')` — uses `apiClient`, good. Cookie clearing will work properly now.

No changes needed in `use-auth.ts`.

- [ ] **Step 3: Fix password-change logout to call server**

In `frontend/src/pages/MyAccountPage.tsx`:

Add import (if not already present):
```typescript
import apiClient from '@/lib/axios';
```

Change lines 113-117 from:
```typescript
try {
  await changePasswordMutation.mutateAsync({ currentPassword, newPassword });
  logout();
  queryClient.clear();
  navigate('/login', { state: { message: 'Password changed successfully. Please login again with your new password.' } });
} catch (err: unknown) {
  setError(getErrorMessage(err, 'Failed to change password'));
}
```
to:
```typescript
try {
  await changePasswordMutation.mutateAsync({ currentPassword, newPassword });
  await apiClient.post('/auth/logout').catch(() => {});
  logout();
  queryClient.clear();
  navigate('/login', { state: { message: 'Password changed successfully. Please login again with your new password.' } });
} catch (err: unknown) {
  setError(getErrorMessage(err, 'Failed to change password'));
}
```

- [ ] **Step 4: Fix restore-success logout to call server**

In `frontend/src/pages/AdminMaintenancePage.tsx`:

Add import (if not already present):
```typescript
import apiClient from '@/lib/axios';
```

Change lines 103-106 from:
```typescript
toast.success('Backup restored successfully. Please log in again.');
queryClient.clear();
logout();
navigate('/login', { replace: true });
```
to:
```typescript
toast.success('Backup restored successfully. Please log in again.');
await apiClient.post('/auth/logout').catch(() => {});
queryClient.clear();
logout();
navigate('/login', { replace: true });
```

- [ ] **Step 5: Verify frontend builds**

```bash
cd /home/adtywbw/apps/it-support-ticketing/frontend && npm run build
```
Expected: exit 0, no TypeScript errors.

- [ ] **Step 6: Verify frontend lint**

```bash
cd /home/adtywbw/apps/it-support-ticketing/frontend && npm run lint
```
Expected: exit 0, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/axios.ts frontend/src/pages/MyAccountPage.tsx frontend/src/pages/AdminMaintenancePage.tsx
git commit -m "fix: add withCredentials to apiClient and server-backed logout for password-change/restore"
```

---

### Task 4: Final verification

- [ ] **Step 1: Run full backend build and tests**

```bash
cd /home/adtywbw/apps/it-support-ticketing/backend && npm run build && npm test
```

- [ ] **Step 2: Run full frontend build and lint**

```bash
cd /home/adtywbw/apps/it-support-ticketing/frontend && npm run build && npm run lint
```

- [ ] **Step 3: Review git log**

```bash
git log --oneline -5
```

- [ ] **Step 4: Report summary**

List all files changed, root cause, verification output, and any behavior changes.
