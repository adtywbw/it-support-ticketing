# Code Review — IT Support Ticketing

---

## 🔴 SECURITY

### S-1 [CRITICAL] JWT fallback hardcoded di 3 lokasi
**File:** `backend/src/auth/auth.module.ts:16`, `auth/strategies/jwt.strategy.ts:10`, `auth/auth.service.ts:51,86`

Semua lokasi menggunakan `'super-secret-key'` sebagai fallback jika `JWT_SECRET` tidak diset. Di Docker build, jika lupa set env variable, secret-nya diketahui publik. Semua token bisa dipalsukan.

**Fix:** Lempar exception di startup jika `JWT_SECRET` tidak diset, atau gunakan nilai default yang unik per-install.

---

### S-2 [HIGH] WebSocket gateway tanpa autentikasi
**File:** `backend/src/notifications/notifications.gateway.ts:23`

`client.handshake.query.userId` diambil langsung tanpa verifikasi JWT. Siapa pun bisa connect dengan `?userId=<uuid>` dan menerima notifikasi user lain.

**Fix:** Validasi JWT token di handshake (middleware Socket.IO) atau binding userId dari token, bukan dari query param.

---

### S-3 [HIGH] Token sensitif (refresh token) di localStorage via zustand persist
**File:** `frontend/src/stores/auth-store.ts`

`accessToken` dan `refreshToken` di-persist ke `localStorage`. Rentan terhadap XSS attack karena JavaScript dapat membaca localStorage.

**Fix:** Pindahkan refresh token ke httpOnly cookie; simpan hanya akses token di memory (zustand tanpa persist).

---

### S-4 [HIGH] EndUser bisa lihat ticket user lain via `findById`
**File:** `backend/src/tickets/tickets.controller.ts:64-67`

`findById` hanya pakai `@UseGuards(JwtAuthGuard)` tanpa `RolesGuard`. Tidak ada filtering bahwa EndUser hanya boleh lihat ticket miliknya sendiri. EndUser bisa enumerasi UUID ticket.

**Fix:** Tambahkan role guard atau filter di service: EndUser hanya boleh lihat ticket dengan `requesterId = userId`.

---

### S-5 [MEDIUM] Path traversal potensial di download attachment
**File:** `backend/src/attachments/attachments.controller.ts:51`

`fs.createReadStream(attachment.path)` menggunakan path dari DB tanpa validasi bahwa path berada di dalam `UPLOAD_DIR`. Meskipun nama file digenerate dengan UUID, tidak ada jaminan path tidak mengandung `../`.

**Fix:** Resolve path absolut dan verifikasi path dimulai dengan `UPLOAD_DIR`.

---

### S-6 [MEDIUM] Password change tidak invalidate existing JWT
**File:** `backend/src/auth/auth.service.ts`

Setelah `changePassword`, JWT lama tetap valid sampai expired. Tidak ada blacklist/version token.

**Fix:** Tambahkan `tokenVersion` field di user, sertakan di JWT payload, dan cek di JWT strategy.

---

### S-7 [LOW] Rate limiter global tidak spesifik ke login
**File:** `backend/src/app.module.ts`

Throttler 10 req/s global — seharusnya endpoint `/auth/login` punya limit lebih ketat (misal 5 req/menit per IP).

**Fix:** Terapkan throttler decorator spesifik ke login endpoint.

---

## 🔴 BUG

### B-1 [HIGH] Audit trail endpoint tidak ada di backend, dipanggil frontend
**File:** `frontend/src/hooks/use-tickets.ts:171`

Memanggil `GET /tickets/:id/audit` tapi backend `tickets.controller.ts` tidak menyediakan route tersebut. Akan selalu 404. Data audit trail sebenarnya sudah tersedia di response `findById` lewat `ticket.histories`.

**Fix:** Hapus `useTicketAuditTrail` dan ambil histories dari response `useTicket`.

---

### B-2 [MEDIUM] Filter `OnHold` tidak ada di frontend
**File:** `frontend/src/components/tickets/TicketFilters.tsx:33-38`

Daftar status filter tidak mencakup `OnHold`, padahal ticket bisa berstatus OnHold. User tidak bisa memfilter ticket OnHold.

**Fix:** Tambahkan `OnHold` ke array statuses di TicketFilters.

---

### B-3 [MEDIUM] Validasi password tidak konsisten frontend vs backend
**File:** `frontend/src/components/auth/LoginForm.tsx:27`, `backend/src/auth/dto/login.dto.ts:8`

Frontend validasi min 6 karakter (`password.length < 6`), backend pakai `@MinLength(8)`. Frontend akan submit password 6-7 karakter dan ditolak backend tanpa pesan jelas.

**Fix:** Samakan validasi: frontend juga min 8 karakter.

---

### B-4 [MEDIUM] Sidebar New Ticket tidak muncul untuk EndUser
**File:** `frontend/src/components/layout/Sidebar.tsx:30-38`

`New Ticket` hanya untuk `['ITSupport', 'Admin']`, tapi backend `tickets.controller.ts` mengizinkan `EndUser` membuat ticket via API. EndUser bisa akses `/tickets/new` via URL langsung tapi tidak ada navigasi.

**Fix:** Tambahkan `EndUser` ke roles nav item New Ticket, atau sembunyikan di backend level.

---

### B-5 [LOW] Error response dari class-validator format tidak konsisten
**File:** `backend/src/common/filters/http-exception.filter.ts:42`

Class-validator errors mengembalikan `message` sebagai array of strings, yang di-join dengan `, `. Frontend parsing `response?.data?.message` expecting string — hasil join bisa membingungkan.

**Fix:** Ambil elemen pertama array jika `message` adalah array.

---

### B-6 [LOW] Frontend Dashboard hook akses `complianceRate` yang tidak ada di backend
**File:** `frontend/src/hooks/use-dashboard.ts:36`

Backend `dashboard.service.ts` mengembalikan `complianceRate` di dalam `slaStats`. Frontend mengakses `raw.slaStats.complianceRate`. Jika struktur response berubah, akan undefined.

**Fix:** Gunakan fallback value atau typed interface untuk raw response.

---

## 🟡 ARCHITECTURE

### A-1 [MEDIUM] Dead code: `TransformInterceptor` tidak pernah diregistrasi
**File:** `backend/src/common/interceptors/transform.interceptor.ts`

Seluruh file ini tidak digunakan. `main.ts` tidak memanggil `useGlobalInterceptors`. Tidak ada controller yang mengimportnya.

**Fix:** Hapus file, atau registrasikan jika memang diperlukan.

---

### A-2 [MEDIUM] Global `window.__authStore` sebagai coupling pattern
**File:** `frontend/src/stores/auth-store.ts:47`, `frontend/src/lib/axios.ts:19`

Akses store via `window.__authStore` melanggar prinsip unidirectional data flow. Store mutation dari dalam interceptor menciptakan circular dependency implicit.

**Fix:** Export function `getTokens()` dari auth store, atau inject token ke axios instance via closure saat login.

---

### A-3 [MEDIUM] Duplikasi logika dashboard
**File:** `backend/src/dashboard/dashboard.service.ts`, `backend/src/tickets/tickets.service.ts`

`getStatusCounts`, `getPriorityCounts`, `getSLAStats`, `getDailyTrends`, `getAvgResolutionTimeByCategory` diimplementasikan duplikat di dua service. Dashboard service dan ticket service memiliki copy-paste logic.

**Fix:** Pindahkan ke shared service atau repository layer.

---

### A-4 [MEDIUM] SLA create/update tanpa DTO validation
**File:** `backend/src/sla/sla.controller.ts:31-50`

Menggunakan inline type annotation `{ categoryId: string; ... }` tanpa decorator validasi. Semua field bisa undefined atau invalid.

**Fix:** Buat DTO class dengan `@IsUUID()`, `@IsInt()`, `@Min()`, `@IsEnum(Priority)`.

---

### A-5 [LOW] `Record<string, unknown>` digunakan sebagai Prisma where type
**File:** `backend/src/comments/comments.service.ts:64`, `backend/src/users/users.service.ts:43`, `backend/src/notifications/notifications.service.ts:39`

Beberapa service menggunakan `Record<string, unknown>` untuk Prisma where. Ini menghilangkan type-safety dan auto-completion.

**Fix:** Gunakan tipe Prisma yang tepat seperti `Prisma.CommentWhereInput`.

---

## 🟠 PERFORMANCE

### P-1 [HIGH] SLA cron job query semua active tickets tanpa paginasi
**File:** `backend/src/sla/sla.service.ts:85-100`

Cron `*/5 * * * *` menjalankan `findMany` tanpa `take`/`skip` untuk semua ticket active. Dengan 10.000+ ticket, query akan loading ribuan baris + include `category.slaConfigs` ke memory setiap 5 menit.

**Fix:** Batch process dengan pagination (e.g., 500 per batch) atau gunakan raw SQL update.

---

### P-2 [MEDIUM] Dashboard aggregation dilakukan di memory instead of database
**File:** `backend/src/dashboard/dashboard.service.ts:99-103,124-134`

`getDailyTrends` fetch semua tickets dalam date range lalu di-aggregate manual di JavaScript. `getAvgResolutionTimeByCategory` juga fetch semua resolved tickets tanpa limit.

**Fix:** Gunakan Prisma `groupBy`, raw SQL, atau window functions untuk aggregation di database.

---

### P-3 [MEDIUM] Sequential notification loop
**File:** `backend/src/notifications/notifications.service.ts:89-96`

```typescript
for (const user of itsupportUsers) {
  await this.create({ userId: user.id, ... });
}
```

Membuat N sequential query. Dengan 100 support users, ini blocking 100 round-trips ke DB.

**Fix:** Pakai `prisma.notification.createMany()` untuk batch insert.

---

### P-4 [LOW] Duplikasi query di TicketDetail
**File:** `frontend/src/components/tickets/TicketDetail.tsx`

Memanggil `useTicket(id)`, `useTicketComments(id)`, `useTicketAttachments(id)`, `useTicketAuditTrail(id)` — 4 query terpisah. Backend `findById` sudah include semua data tersebut dalam satu query.

**Fix:** Hapus query terpisah dan ambil data dari response `useTicket`.

---

## 🔵 MAINTAINABILITY

### M-1 [MEDIUM] Notifications gateway — event payload tanpa tipe
**File:** `backend/src/notifications/notifications.gateway.ts:43`

Event handler menggunakan anonymous object type `{ userId: string; title: string; ... }` tanpa interface yang reusable. Rentan typo dan refactoring error.

**Fix:** Definisikan interface untuk setiap event payload.

---

### M-2 [MEDIUM] SubCategoryManager melakukan N+1 fetch sub-categories
**File:** `frontend/src/components/admin/MasterDataManagement.tsx:245-251`

Untuk setiap category, melakukan satu API call ke `/categories/:id/sub-categories`. Jika ada 10 kategori, ada 11 API calls (1 categories + 10 sub-categories).

**Fix:** Buat endpoint backend `/sub-categories?categoryIds=...` atau include sub-categories di response categories.

---

### M-3 [LOW] Tidak ada env validation di startup
**File:** `backend/src/main.ts`

Tidak ada mekanisme untuk memvalidasi bahwa `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL` sudah diset sebelum app start. App bisa start dengan konfigurasi tidak lengkap dan error di runtime.

**Fix:** Tambahkan env validation guard di `bootstrap()`.

---

### M-4 [LOW] Test coverage hanya 1 spec file (14 test)
**File:** `backend/src/tickets/tickets.service.spec.ts`

Satu file spec untuk satu service dengan mocking yang berat (menggunakan `jest.fn()` manual, bukan pattern dari NestJS testing utilities). Tidak ada test untuk auth, users, categories, comments, dashboard, notifications, attachments.

**Fix:** Tambahkan test untuk endpoint kritis: auth (login/refresh/logout), authorization (role-based access), comments visibility, dan SLA check.

---

### M-5 [LOW] Unused variable `where` di comment controller
**File:** `backend/src/comments/comments.controller.ts`

Router path menggunakan `'tickets/:ticketId/comments'` tanpa parameter `@Param('ticketId')` prefix yang konsisten dengan controller di service call.

---

## Ringkasan

| Kategori | Count | Severity Tertinggi |
|---|---|---|
| Security | 7 | 🔴 CRITICAL |
| Bug | 6 | 🔴 HIGH |
| Architecture | 5 | 🟡 MEDIUM |
| Performance | 4 | 🟠 HIGH |
| Maintainability | 5 | 🔵 MEDIUM |

**Prioritas perbaikan:**
1. **Segera:** Hardcoded JWT secret (S-1), WebSocket auth bypass (S-2)
2. **Segera:** Audit trail endpoint missing (B-1), SLA cron unbounded query (P-1)
3. **Berikutnya:** localStorage token exposure (S-3), EndUser lihat ticket lain (S-4)
4. **Berikutnya:** Duplikasi dashboard logic (A-3), N+1 fetch sub-categories (M-2)
