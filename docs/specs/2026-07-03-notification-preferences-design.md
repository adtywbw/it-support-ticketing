# Notification Preferences per Role — Design

- **Date:** 2026-07-03
- **Status:** Approved (design)
- **Scope:** Let each user choose which in-app notification event types appear in their own notification panel; the set of toggleable types is scoped by the user's role.

## 1. Problem & Goal

Today every in-app notification is created unconditionally based on hardcoded rules in `NotificationsService` (e.g. all ITSupport/Admin users always receive a "New Ticket Created" notification). Users cannot opt out of notification types they do not care about.

Goal: per-user notification preferences where the available event types differ by role:
- **EndUser** toggles: `ticket.created` (own-ticket confirmation), `ticket.status.updated` (own tickets).
- **ITSupport / Admin** toggles: `ticket.created`, `ticket.assigned`, `ticket.status.updated`.

## 2. Locked Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Who configures preferences | **Per-user**, with the toggleable set scoped by role. Each user configures their own in My Account. |
| 2 | Effect of turning a type off | **Filter at creation** — the notification record is never created for that user. No record, no unread count, no WebSocket push. |
| 3 | Default state (existing & new users) | **All ON** (per the types relevant to the role). Backwards compatible — no behavior change on deploy until a user explicitly disables something. |
| 4 | Scope of the gate | **In-app only.** Telegram is governed by the existing global `TelegramConfig.enabledEvents` (Admin-controlled). The two channels are independent. |

Non-goals (YAGNI):
- No new notification event types beyond the three that exist today.
- No per-role defaults managed by Admin (decision 1 = per-user).
- No channel-level granularity beyond in-app vs the already-separate Telegram config.
- No changes to Telegram, WebSocket gateway, or notification listing queries.

## 3. Architecture & Data Model

### 3.1 Prisma schema

Add a nullable JSON column to `User`:

```prisma
model User {
  ...
  notificationPreferences Json?   // null = all on (default)
}
```

- Migration adds a nullable `notificationPreferences` column to the `users` table (camelCase, consistent with existing fields like `telegramChatId` which use no `@map`).
- Existing rows get `null` = all on → no backfill needed, no behavior change.
- A 1:1 attribute on `User` is consistent with existing per-user config stored on the same model (`telegramChatId`, `telegramCode`) and with `TelegramConfig.settings` (JSON).

### 3.2 Preference JSON shape

Sparse object mapping **event name** → boolean. Absent key / `null` = on:

```json
{ "ticket.created": false, "ticket.assigned": true }
```

Event names (`ticket.created`, `ticket.assigned`, `ticket.status.updated`) are used as keys to stay consistent with the `EventEmitter2` event names and `TelegramConfig.enabledEvents` already used in the codebase. (The notification record's `data.type` field uses underscored values like `ticket_created`; that is a separate field and is not used as the preference key.)

### 3.3 Shared util — `backend/src/common/utils/notification-preference.util.ts`

```ts
export const NOTIFICATION_EVENTS = [
  { event: 'ticket.created',         label: 'New Ticket Created',       roles: [Role.EndUser, Role.ITSupport, Role.Admin] },
  { event: 'ticket.assigned',        label: 'Ticket Assigned',          roles: [Role.ITSupport, Role.Admin] },
  { event: 'ticket.status.updated',  label: 'Ticket Status Updated',    roles: [Role.EndUser, Role.ITSupport, Role.Admin] },
] as const;

export function getEventsForRole(role: Role): { event: string; label: string }[];
export function isEventEnabled(prefs: unknown, event: string): boolean; // prefs?.[event] ?? true
export function normalizePreferences(prefs: unknown, role: Role): Record<string, boolean>;
```

- `isEventEnabled`: returns `prefs?.[event] ?? true` (absent/null/undefined = on). Non-object `prefs` is treated as all-on.
- `normalizePreferences`: returns an object containing only the keys relevant to `role`, each defaulted to `true` when absent. Used by GET (for display) and PATCH (for storage).

### 3.4 UserRepository — new / extended methods

- Extend `findSupportUsers()` select to also return `notificationPreferences`. **Single consumer** today is `NotificationsService.handleTicketCreated`, so the additive change is safe and avoids an extra query for the batch case.
- `getNotificationPreferences(userIds: string[]): Promise<Map<string, unknown>>` — batch fetch of stored preferences (used by the `ticket.assigned` and `ticket.status.updated` handlers; a single call covers 1–2 users).
- `setNotificationPreferences(userId: string, prefs: Record<string, boolean>)` — update the column.

## 4. Backend Filtering Logic (`NotificationsService`)

Core idea: each event handler checks the relevant preference **before** calling `create()`. Because filtering happens at creation, a skipped `create()` means no record is written and the `notification.created` event is never emitted — therefore no WebSocket push. This keeps `NotificationRepository`, `NotificationsGateway`, and the list / unread-count queries unchanged; they only ever see created notifications.

Helper (pure, no fetch):
- `private isEnabled(prefs: unknown, event: string): boolean` — delegates to `isEventEnabled(prefs, event)`.

Per handler:

### 4.1 `handleTicketCreated` (event `ticket.created`)
- `findSupportUsers()` now returns `[{ id, notificationPreferences }]`.
- For each support user: `if (isEnabled(user.notificationPreferences, 'ticket.created')) create(...)`. No extra query.
- Requester (only when not already a support user, preserving the existing `requesterIsNotSupport` check): `getNotificationPreferences([requesterId])` (one query) → `if (isEnabled(..., 'ticket.created')) create(...)`.

### 4.2 `handleTicketAssigned` (event `ticket.assigned`)
- `getNotificationPreferences([assignedToId])` → `if (isEnabled(..., 'ticket.assigned')) create(...)`.

### 4.3 `handleTicketStatusUpdated` (event `ticket.status.updated`)
- `getNotificationPreferences([assignedToId, requesterId])` (dedup if equal → one query) → for each target, `if (isEnabled(..., 'ticket.status.updated')) create(...)`. The existing `notified` Set dedup is preserved.

### 4.4 Untouched
- `TelegramService` is not modified — it listens to the same events separately and obeys the global `TelegramConfig.enabledEvents`.
- `NotificationsGateway` is not modified.
- `NotificationRepository` query methods are not modified.

## 5. API Endpoints

Placed in the `notifications` module (`NotificationsController` / `NotificationsService`) — cohesive ("your notifications + your notification settings") and the service already injects `UserRepository`. Both endpoints are authenticated by the global `JwtAuthGuard` and scoped to the calling user via `@CurrentUser`; no `@Roles` is needed because every role manages its own preferences.

### 5.1 `GET /api/notifications/preferences`
Response (wrapped by `TransformInterceptor` into `{ data }`):
```json
{
  "data": {
    "preferences": {
      "ticket.created": true,
      "ticket.assigned": false,
      "ticket.status.updated": true
    },
    "availableEvents": [
      { "event": "ticket.created", "label": "New Ticket Created" },
      { "event": "ticket.assigned", "label": "Ticket Assigned" },
      { "event": "ticket.status.updated", "label": "Ticket Status Updated" }
    ]
  }
}
```
`preferences` is normalized for the caller's role — every role-relevant key is present, defaulted to `true` if unset. EndUser will not see `ticket.assigned` in either `preferences` or `availableEvents`.

### 5.2 `PATCH /api/notifications/preferences`
Body:
```json
{ "preferences": { "ticket.created": true, "ticket.assigned": false } }
```

DTO: `UpdateNotificationPreferencesDto { @IsObject() preferences: Record<string, boolean> }` plus a `@Transform` to ensure the value is a plain object. Key/value validation is performed in the service (class-validator has no clean "record of" validator).

Service logic:
1. For each entry: key must be in `getEventsForRole(user.role)`; value must be a boolean. Any violation → `BadRequestException`.
2. Normalize: store only role-relevant keys (drop stale keys, e.g. from a previous role).
3. `userRepository.setNotificationPreferences(userId, normalized)`.
4. Return the same shape as GET (normalized preferences + availableEvents).

Error responses (via `HttpExceptionFilter`): `{ error: { code: 'BAD_REQUEST', message } }` for an invalid key or a non-boolean value.

No other endpoints change. Existing list / unread-count / clear-all / mark-read endpoints remain correct because of filter-at-creation.

## 6. Frontend

### 6.1 Types — `frontend/src/types/index.ts`
```ts
export interface NotificationEventOption { event: string; label: string; }
export interface NotificationPreferencesMap { [event: string]: boolean; }
export interface NotificationPreferencesResponse {
  preferences: NotificationPreferencesMap;
  availableEvents: NotificationEventOption[];
}
```

### 6.2 Constants — `frontend/src/lib/constants.ts`
```ts
export const STALE_TIME_NOTIFICATION_PREFERENCES = 5 * 60 * 1000;
```
(Reference-tier, analogous to `STALE_TIME_TELEGRAM_CONFIG`.)

### 6.3 Hook — `frontend/src/hooks/use-notification-preferences.ts`
- `useNotificationPreferences()` — GET `/notifications/preferences`; queryKey `['notification-preferences']`; staleTime `STALE_TIME_NOTIFICATION_PREFERENCES`.
- `useUpdateNotificationPreferences()` — mutation PATCH; on success invalidate `['notification-preferences']`. The notifications list is **not** invalidated (filter-at-creation means skipped future notifications simply never exist).

### 6.4 Component — `frontend/src/components/account/NotificationPreferencesSection.tsx`
New domain folder `components/account/`. Extracted into its own component so the already-large `MyAccountPage` does not grow further and the section is independently testable.

Behavior:
- Fetch via `useNotificationPreferences()`; local `preferences` state initialized from query data; an `initialRef` to detect `hasChanges` — mirrors the existing Telegram section pattern in `MyAccountPage`.
- Render one checkbox per `availableEvents` (label from the API); `checked = preferences[event]`.
- Save button disabled when `!hasChanges` or `isPending`; on success `toast.success`, on error `toast.error` via `getErrorMessage` (per the frontend error pitfall).
- Loading skeleton during the initial fetch.

### 6.5 `MyAccountPage`
- Render `<NotificationPreferencesSection />` for **all roles**, placed after the profile header and before Change Password (so EndUser, who has no Change Password section, still sees a configurable section).
- Do not touch the existing Change Password or Telegram sections.

### 6.6 Per-role visibility (driven by the API)
- EndUser → 2 checkboxes (`ticket.created`, `ticket.status.updated`).
- ITSupport / Admin → 3 checkboxes (all three).

## 7. Error Handling & Edge Cases

- **Backend validation:** `@IsObject()` + `@Transform` on the DTO; manual key/value validation in the service → `BadRequestException` for keys outside the caller's role events or non-boolean values. This endpoint is not a maintenance-allowed path, so `MaintenanceGuard` returns 503 before the handler runs during maintenance — no special Prisma try/catch is required.
- **Role change (e.g. ITSupport → EndUser):** stored prefs may contain a stale `ticket.assigned` key. GET and PATCH normalize per the current role (stale keys are dropped). The creation-filter logic only checks events actually emitted for that user, so a stale key is harmless. PATCH always persists the normalized (role-relevant-only) object.
- **Existing users (`null` prefs):** GET returns all `true` plus `availableEvents`; the filter treats `null` as all-on → no behavior change on deploy.
- **Empty object `{}`:** valid; means all defaults (all on).
- **Concurrent PATCH from the same user:** last write wins. Acceptable for personal settings.

## 8. Testing

### 8.1 Backend (`backend/src/notifications/__tests__/`, follow existing spec patterns)
- `isEventEnabled`: returns `true` for `null`/`undefined`/absent key; `false` when explicitly `false`; non-object prefs treated as all-on.
- `handleTicketCreated`: skips a support user with `ticket.created` disabled; skips the requester when disabled; still creates for enabled users.
- `handleTicketAssigned`: skips when `ticket.assigned` is disabled.
- `handleTicketStatusUpdated`: skips a target with `ticket.status.updated` disabled; preserves the `notified` Set dedup.
- Preference service methods: `getPreferences` normalizes per role; `updatePreferences` throws `BadRequestException` on an invalid key / non-boolean value; persists the normalized object.
- DTO validation: `whitelist` + `forbidNonWhitelisted` behavior for the `preferences` object.
- Mock `UserRepository` and `NotificationRepository` per existing spec conventions.

### 8.2 Frontend (`vitest`, follow `NotificationsPage.test.tsx` patterns)
- `NotificationPreferencesSection`: renders one checkbox per `availableEvents`; toggling updates local state; Save disabled until a change; Save calls the mutation; `toast.success` on success; `toast.error` on failure.
- `use-notification-preferences` hook tests if the repo has a hook-test convention.

## 9. Migration & Deployment

- Prisma migration: add nullable `notificationPreferences` column to `users` (`npx prisma migrate dev`). Existing rows → `null` = all on. **No data backfill.**
- No Redis, Docker, or nginx changes.
- Backwards compatible: deploy backend + frontend together; users see all-on until they change their own preferences.

## 10. Verification

| Area | Workdir | Command |
|------|---------|---------|
| Backend unit tests | `backend` | `npm test` |
| Backend build | `backend` | `npm run build` |
| Frontend build | `frontend` | `npm run build` |
| Frontend lint | `frontend` | `npm run lint` |
| Frontend tests | `frontend` | `vitest` |

## 11. Files Touched (summary)

Backend:
- `backend/prisma/schema.prisma` — add `notificationPreferences Json?` to `User`.
- `backend/prisma/migrations/<ts>_add_notification_preferences/` — new migration.
- `backend/src/common/utils/notification-preference.util.ts` — new.
- `backend/src/common/repositories/user.repository.ts` — extend `findSupportUsers()`; add `getNotificationPreferences`, `setNotificationPreferences`.
- `backend/src/notifications/notifications.service.ts` — filter-at-creation in the three handlers; `isEnabled` helper; preference get/update methods.
- `backend/src/notifications/notifications.controller.ts` — `GET`/`PATCH /notifications/preferences`.
- `backend/src/notifications/dto/update-notification-preferences.dto.ts` — new.
- `backend/src/notifications/__tests__/` — new/updated specs.

Frontend:
- `frontend/src/types/index.ts` — new types.
- `frontend/src/lib/constants.ts` — `STALE_TIME_NOTIFICATION_PREFERENCES`.
- `frontend/src/hooks/use-notification-preferences.ts` — new.
- `frontend/src/components/account/NotificationPreferencesSection.tsx` — new.
- `frontend/src/pages/MyAccountPage.tsx` — render the section.
- frontend tests as applicable.
