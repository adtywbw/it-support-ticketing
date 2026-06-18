# Prompt: Full-Stack IT Support Ticketing App in Docker

Kamu adalah AI expert software engineer (solution architect + tech lead) yang akan mendesain dan meng-generate sebuah aplikasi **full-stack ticketing untuk IT Support** yang berjalan di atas **Docker (multi-container, pakai docker-compose)**.

---

## 1. Tujuan & Konteks

- Aplikasi dipakai internal perusahaan untuk mengelola **tiket komplain IT** dari karyawan (end-user) ke tim IT Support.
- Fokus: **MVP yang rapi tapi siap di-scale ke level enterprise** — bukan sekadar demo.
- Deployment awal di environment on-prem atau cloud VM (bukan serverless), menggunakan Docker sebagai baseline packaging dan deployment.

---

## 2. Fitur yang Harus Ada

### 2.1 Manajemen User & Role

- Auth berbasis JWT: **access token** (TTL: 15 menit) + **refresh token** (TTL: 7 hari, di-rotate setiap digunakan, disimpan di Redis dengan key `refresh:<userId>:<tokenId>`).
- Role minimal: `EndUser`, `ITSupport`, `Admin`.
- **EndUser:** buat tiket, lihat daftar tiket milik sendiri, tambah komentar, upload attachment, close tiket jika statusnya `Resolved`.
- **ITSupport:** lihat antrian semua tiket, klaim/assign tiket ke diri sendiri, balas tiket (komentar publik), tambah internal note (tidak terlihat EndUser), ubah status dan prioritas, lihat riwayat audit trail.
- **Admin:** kelola user & role, kelola master data (kategori, sub-kategori, prioritas, SLA config), konfigurasi umum.

### 2.2 Manajemen Tiket

**Field tiket:**

| Field | Tipe | Keterangan |
|---|---|---|
| `ticketNumber` | string | Auto-generated, format: `TKT-YYYYMM-XXXXXX` |
| `subject` | string | Maks 255 karakter |
| `description` | text | Boleh markdown |
| `requesterId` | FK → User | User yang membuat tiket |
| `categoryId` | FK → Category | |
| `subCategoryId` | FK → SubCategory | |
| `priority` | enum | `Low`, `Medium`, `High`, `Critical` |
| `status` | enum | `Open`, `InProgress`, `OnHold`, `Resolved`, `Closed` |
| `assignedToId` | FK → User (nullable) | ITSupport yang menangani |
| `channel` | enum | `Web` (hardcoded untuk MVP, extensible) |
| `slaDueAt` | timestamp | Dihitung saat tiket dibuat berdasarkan SLAConfig |
| `resolvedAt` | timestamp (nullable) | |
| `closedAt` | timestamp (nullable) | |

**Status workflow:**
```
Open → InProgress → Resolved → Closed
          ↕
        OnHold
```

**Aturan transisi status** harus divalidasi di backend — tidak boleh lompat status sembarangan.

**Komentar:** dua tipe — `PUBLIC` (terlihat semua pihak) dan `INTERNAL` (hanya ITSupport & Admin).

**Audit trail:** setiap perubahan pada field `status`, `assignedTo`, `priority`, `slaDueAt` dicatat ke tabel `TicketHistory` beserta nilai lama, nilai baru, user yang mengubah, dan timestamp.

### 2.3 File Attachment

- Disimpan di local volume yang dimapping ke container (`/app/uploads`), dengan abstraction layer (interface `StorageService`) agar mudah diganti ke S3/GCS di masa depan.
- **Batasan:** max 5 file per tiket, max 10 MB per file.
- **MIME type yang diizinkan:** `image/jpeg`, `image/png`, `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- File disimpan dengan nama acak (UUID), metadata (nama asli, MIME type, size, path) disimpan di tabel `Attachment`.

### 2.4 SLA & Prioritas

- `SLAConfig` menyimpan mapping `(categoryId, priority) → (responseTimeMinutes, resolutionTimeMinutes)`.
- `slaDueAt` dihitung dari `resolutionTimeMinutes` saat tiket dibuat.
- **SLA breach check** dijalankan via **cron job** di backend (interval: setiap 5 menit), bukan saat query. Job men-update flag `slaStatus` (`OnTrack`, `AtRisk`, `Breached`) di tabel `Ticket`.
  - `AtRisk`: sisa waktu ≤ 20% dari total SLA window.
  - `Breached`: `slaDueAt` sudah terlewati dan status belum `Resolved`/`Closed`.
- Redis digunakan untuk lock cron job agar tidak double-run saat horizontal scaling.

### 2.5 Pencarian & Filter

- Endpoint list tiket dengan **offset-based pagination** (`page`, `limit`, max 100 per halaman).
- Filter yang tersedia: `status`, `priority`, `categoryId`, `assignedToId`, `requesterId`, `slaStatus`, `dateFrom`, `dateTo`, `search` (ILIKE pada `subject` dan `description`).
- Sorting: `createdAt`, `updatedAt`, `slaDueAt`, `priority` — arah `asc`/`desc`.
- Index DB yang wajib ada: `(status)`, `(assignedToId)`, `(requesterId)`, `(createdAt)`, `(slaDueAt)`.

### 2.6 Dashboard & Statistik

Endpoint API untuk data berikut (dikonsumsi chart di frontend):

- Jumlah tiket per status.
- Jumlah tiket per prioritas.
- Tren tiket per hari (7 hari dan 30 hari terakhir).
- SLA compliance rate (% tiket resolved sebelum `slaDueAt`).
- Average resolution time per kategori.

### 2.7 Notifikasi In-App

- Tabel `Notification` di DB menyimpan notifikasi per user (unread count, payload JSON).
- **Trigger notifikasi:**
  - ITSupport & Admin: tiket baru masuk.
  - Requester: tiket di-update (status berubah, ada komentar baru).
  - Assignee: tiket di-assign ke mereka.
- Endpoint: `GET /notifications` (list), `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`.
- Desain event-driven (via EventEmitter internal NestJS) agar mudah ditambah channel lain (email/Slack) tanpa mengubah core logic.

### 2.8 Keamanan

- Password di-hash dengan **bcrypt** (cost factor: 12).
- Semua input divalidasi via **class-validator** di DTO layer (NestJS `ValidationPipe` global).
- Authorization via NestJS **Guard** — role check + ownership check (EndUser hanya bisa akses tiket milik sendiri).
- Rate limiting: **10 request/detik per IP** di Nginx untuk endpoint `/api/`.
- Tidak ada `any` di TypeScript. Aktifkan `strict: true` di `tsconfig.json`.

---

## 3. Tech Stack

### 3.1 Frontend

- **React 18 + TypeScript** (`strict: true`), build tool **Vite**.
- **TanStack Query v5** untuk data fetching & caching server state.
- **Zustand** untuk client state yang perlu di-share (auth session, notifikasi).
- **Tailwind CSS v3** untuk styling — konsisten, tidak campur dengan library UI lain.
- **React Router v6** untuk routing.

**Halaman yang dibutuhkan:**
1. `/login` — form login.
2. `/tickets` — daftar tiket (EndUser: tiket sendiri; ITSupport/Admin: semua tiket).
3. `/tickets/new` — form create tiket.
4. `/tickets/:id` — detail tiket + thread komentar + attachment.
5. `/dashboard` — dashboard statistik (ITSupport/Admin only).
6. `/admin/users` — kelola user & role (Admin only).
7. `/admin/master-data` — kelola kategori, prioritas, SLA (Admin only).

Setiap halaman harus menangani state: **loading**, **error**, **empty state** — tidak boleh ada blank screen tanpa feedback.

### 3.2 Backend

- **Node.js + TypeScript** dengan **NestJS**.
- Gunakan **NestJS module system** secara penuh: setiap domain punya module sendiri (`TicketModule`, `AuthModule`, `UserModule`, dst).
- Guard untuk auth (`JwtAuthGuard`) dan role (`RolesGuard`).
- `ValidationPipe` global dengan `whitelist: true` dan `forbidNonWhitelisted: true`.
- ORM: **Prisma** — inject `PrismaService` langsung ke service layer (tidak perlu repository class tambahan, Prisma Client sudah cukup sebagai query layer).
- API: **REST**, response envelope konsisten:
  ```json
  { "data": ..., "meta": { "page": 1, "limit": 20, "total": 150 } }
  ```
  atau untuk error:
  ```json
  { "error": { "code": "TICKET_NOT_FOUND", "message": "..." } }
  ```

**Struktur module NestJS:**
```
AuthModule, UserModule, TicketModule, CommentModule,
AttachmentModule, CategoryModule, SLAModule,
NotificationModule, DashboardModule, HealthModule
```

### 3.3 Database & Infrastruktur

- **PostgreSQL 16** — database utama.
- **Redis 7** — refresh token store, cron job lock, (opsional) response cache untuk endpoint statistik (TTL: 5 menit).
- **Nginx** — reverse proxy, serve static frontend, route `/api/` ke backend.

---

## 4. Arsitektur Docker

**Service di docker-compose:**

```
nginx (port 80 → host)
  ├── / → frontend (React static build)
  └── /api/ → api (NestJS, port 3000, tidak diekspos ke host)

api → db (PostgreSQL, port 5432, tidak diekspos ke host)
api → cache (Redis, port 6379, tidak diekspos ke host)
```

**Network:**
- Satu internal network `app-network` untuk komunikasi antar container.
- Hanya Nginx yang expose port ke host (port 80, dan 443 untuk production).

**Volume:**
- `postgres_data` → `/var/lib/postgresql/data`
- `uploads_data` → `/app/uploads` (di container api)

**Healthcheck:**
- `db`: `pg_isready -U $POSTGRES_USER`
- `cache`: `redis-cli ping`
- `api`: `GET /api/health` harus return `200 OK`
- `api` depends_on `db` dan `cache` dengan condition `service_healthy`.

---

## 5. Kualitas Kode & Konvensi

- **Penamaan:** camelCase untuk variabel/fungsi, PascalCase untuk class/type/interface, UPPER_SNAKE_CASE untuk konstanta dan env var.
- **Folder naming:** kebab-case.
- **Tidak ada `any`** di TypeScript.
- **Prisma migrations** di-run via entrypoint script sebelum app start (`prisma migrate deploy`).
- Semua konfigurasi via environment variable — tidak ada hardcoded secret.
- Error yang dilempar dari service harus menggunakan NestJS built-in exception (`NotFoundException`, `ForbiddenException`, dst) atau custom exception yang extend `HttpException`.

---

## 6. Output yang Diharapkan

Hasilkan item berikut secara berurutan:

### 6.1 Arsitektur Overview
Deskripsi singkat arsitektur (diagram teks) dan justifikasi pemilihan stack.

### 6.2 Skema Database (ERD Tekstual)
Definisi tabel, kolom (dengan tipe data), relasi, dan index untuk:
`User`, `Ticket`, `Comment`, `Attachment`, `Category`, `SubCategory`, `Priority`, `SLAConfig`, `TicketHistory`, `Notification`.

### 6.3 Struktur Folder
Struktur direktori lengkap untuk:
- `frontend/` (React + Vite)
- `backend/` (NestJS)
- Root level (docker-compose, nginx, env)

### 6.4 Contoh Kode Kunci

Implementasikan end-to-end use case **"Create Ticket + List Ticket"**:

**Backend:**
- Prisma schema (`schema.prisma`) untuk entitas `Ticket`, `User`, `Comment`.
- `CreateTicketDto` dengan class-validator.
- `TicketsService` — method `create()` dan `findAll()` dengan filtering & pagination.
- `TicketsController` — endpoint `POST /tickets` dan `GET /tickets`.
- `JwtAuthGuard` dan `RolesGuard` contoh implementasi.

**Frontend:**
- Custom hook `useTickets()` menggunakan TanStack Query untuk `GET /tickets`.
- Custom hook `useCreateTicket()` menggunakan `useMutation`.
- Contoh komponen `TicketList` dan `CreateTicketForm`.

**Test:**
- Unit test untuk `TicketsService.create()` dengan mock `PrismaService` (Jest).
- Minimal 1 happy path dan 1 error case (misal: kategori tidak ditemukan).

### 6.5 File Konfigurasi Docker

Dalam bentuk code block, berikan:

1. **`docker-compose.yml`** — semua service (frontend, api, db, cache, nginx) dengan healthcheck, volume, dan network.
2. **`backend/Dockerfile`** — multi-stage: `builder` (compile TS) dan `production` (hanya artifact + node_modules prod).
3. **`frontend/Dockerfile`** — multi-stage: `builder` (Vite build) dan `production` (Nginx serve static).
4. **`nginx/nginx.conf`** — dengan: `gzip on`, `proxy_pass` ke api dengan timeout yang wajar (60s), serve static frontend dari `/usr/share/nginx/html`, rate limit zone 10r/s.
5. **`.env.example`** — semua environment variable yang dibutuhkan dengan komentar penjelasan:
   ```
   DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET,
   JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN,
   UPLOAD_MAX_SIZE_MB, UPLOAD_DIR, NODE_ENV, PORT
   ```

### 6.6 Migration & Seed

- Contoh file Prisma migration untuk tabel `Ticket`.
- Seed script (`prisma/seed.ts`) untuk: 1 Admin user, 2 kategori dengan SLA config, dan 1 sample ticket.

### 6.7 Saran Scaling (High-Level)

Poin-poin konkret untuk scaling ke Kubernetes atau cloud-native, termasuk:
- Apa yang perlu diubah dari arsitektur saat ini.
- Bagaimana handle file upload saat multi-replica (hint: pindah ke object storage).
- Bagaimana handle cron job SLA check saat multi-replica (hint: Redis lock sudah disiapkan).

---

## 7. Non-Functional Requirements

- **Performance:** semua index yang disebutkan di 2.5 harus ada di Prisma schema.
- **Observability:** endpoint `GET /api/health` return status DB dan Redis. Request log di Nginx (format: combined). Error log di NestJS (level: error, warn).
- **Reproducibility:** `docker compose up` dari scratch (setelah isi `.env`) harus berhasil tanpa langkah manual tambahan.

---

> **Gunakan bahasa teknis yang padat. Hindari penjelasan konsep yang sudah umum diketahui. Fokus pada keputusan desain yang opinionated dan siap diimplementasikan.**
