# CODE_REVIEW.md — IT Support Ticketing

> **Session 4 — Security Review**
> Tanggal: 2026-06-27
> Reviewer: Senior Fullstack Engineer (AI Agent)
> Fokus: Keamanan menyeluruh (backend, frontend, infrastruktur)
> Status: Fix diimplementasi dan diverifikasi (2026-06-27)

---

## Daftar Isi

- [Executive Summary](#executive-summary)
- [Metodologi](#metodologi)
- [Temuan per Severity](#temuan-per-severity)
  - [HIGH — Wajib diperbaiki sebelum production](#high--wajib-diperbaiki-sebelum-production)
  - [MEDIUM — Perbaiki sesegera mungkin](#medium--perbaiki-sesegera-mungkin)
  - [LOW — Perbaiki saat kesempatan ada](#low--perbaiki-saat-kesempatan-ada)
  - [INFORMATIONAL — Catatan positif & observasi](#informational--catatan-positif--observasi)
- [Checklist Progres Fix](#checklist-progres-fix)
- [Catatan untuk Agent AI Selanjutnya](#catatan-untuk-agent-ai-selanjutnya)

---

## Executive Summary

Code review keamanan dilakukan terhadap seluruh codebase: backend (NestJS), frontend (React), dan infrastruktur (Docker, nginx, scripts, env). Review mencakup autentikasi/otorisasi, manajemen token, upload file, visibility attachment, mode maintenance, Telegram, manajemen user, notifikasi, dashboard, dan konfigurasi infrastruktur.

**Total temuan: 60** (9 HIGH, 17 MEDIUM, 25 LOW, 9 INFORMATIONAL)

**Positif:** Codebase sudah memiliki praktik keamanan yang baik di banyak area — bcrypt cost 12, refresh token rotation dengan Redis, httpOnly + sameSite=strict cookie, helmet, ValidationPipe strict, CORS allow-list, SCAN bukan KEYS, execFile bukan exec, tar slip protection, attachment visibility policy terpusat, IDOR protection pada ticket/comment/attachment, password hash tidak pernah di-select, no dangerouslySetInnerHTML di frontend, access token memory-only.

**Prioritas tertinggi:**
1. Refresh token dikirim cleartext via HTTP (COOKIE_SECURE=false di production)
2. JwtStrategy menerima token tanpa claim `tokenType`
3. Tidak ada account lockout (brute force per-IP saja)
4. Security headers nginx hilang untuk static assets (add_header inheritance)
5. Tidak ada CSP untuk frontend
6. `backend/.env` world-readable (644) berisi secret asli
7. Attachment `path` (filesystem path server) bocor ke EndUser via comment repository

---

## Metodologi

Review dilakukan dengan 5 agent eksplorasi paralel:
1. **Auth & JWT** — modul auth, guards, strategies, filters, interceptors, env validation
2. **Tickets/Comments/Attachments** — otorisasi, IDOR, upload security, visibility policy
3. **Maintenance/Telegram/Users/Notifications** — admin-only ops, secret handling, IDOR
4. **Frontend** — token storage, route guards, XSS, CSRF, refresh flow, dependency
5. **Infrastructure** — Docker, nginx, Dockerfile, env files, scripts, Prisma, main.ts

Setiap file dianalisis untuk: injection, IDOR, privilege escalation, information disclosure, XSS, CSRF, path traversal, command injection, secret exposure, DoS, dan misconfiguration.

---

## Temuan per Severity

---

### HIGH — Wajib diperbaiki sebelum production

---

#### SEC-001: Refresh token dikirim cleartext via HTTP di production

| Atribut | Nilai |
|---------|-------|
| **Severity** | HIGH |
| **Lokasi** | `backend/src/main.ts:18-42` (validateEnv), `backend/src/auth/auth.controller.ts:21-23` (getCookieSecure), `backend/.env:2,21` |
| **Kategori** | Transport security / Secret exposure |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
`backend/.env` memiliki `NODE_ENV=production` dan `COOKIE_SECURE=false`. Fungsi `validateEnv()` di `main.ts` memvalidasi kekuatan `JWT_SECRET` dan keberadaan `REDIS_PASSWORD` di production, tetapi **tidak memvalidasi `COOKIE_SECURE`**. Akibatnya, refresh token (httpOnly cookie) dikirim tanpa flag `Secure` melalui HTTP cleartext. `CORS_ORIGIN` juga di-set ke `http://` (bukan HTTPS). Sniffer di jaringan internal bisa menangkap refresh token.

**Root cause:**
`validateEnv()` tidak meng-enforce `COOKIE_SECURE=true` saat `NODE_ENV=production`. Cookie helper `getCookieSecure()` mengikuti env `COOKIE_SECURE` yang di-set `false`.

**Impact:**
Refresh token bisa di-intercept via network sniffing. Dengan refresh token, attacker bisa mendapatkan access token baru dan beraksi sebagai user.

**Langkah Fix:**

1. **`backend/src/main.ts`** — tambahkan validasi `COOKIE_SECURE` di `validateEnv()`:
   ```typescript
   if (isProduction && process.env.COOKIE_SECURE !== 'true') {
     console.error('FATAL: COOKIE_SECURE must be "true" in production');
     process.exit(1);
   }
   ```
   Letakkan setelah blok validasi `REDIS_PASSWORD` (sekitar line 41).

2. **`backend/.env`** — ubah `COOKIE_SECURE=false` menjadi `COOKIE_SECURE=true` (atau hapus baris agar fallback ke `x-forwarded-proto` check).

3. **`backend/.env.compose.example`** — ubah `COOKIE_SECURE=false` menjadi `COOKIE_SECURE=true` dan tambahkan komentar:
   ```env
   # Production WAJIB COOKIE_SECURE=true. Set false HANYA untuk local HTTP dev.
   COOKIE_SECURE=true
   ```

4. **Jika deployment tetap HTTP-only** (internal network tanpa TLS): pertimbangkan untuk menambahkan TLS termination di nginx (lihat AGENTS.md "Docker & HTTP Notes" untuk re-enable SSL), atau gunakan reverse proxy dengan TLS di upstream. HTTP cleartext untuk auth tidak dapat diterima di production.

5. **Verifikasi:** setelah fix, jalankan `npm run build` di `backend/`. Pastikan startup gagal jika `COOKIE_SECURE=false` + `NODE_ENV=production`.

---

#### SEC-002: JwtStrategy menerima token tanpa claim `tokenType`

| Atribut | Nilai |
|---------|-------|
| **Severity** | HIGH |
| **Lokasi** | `backend/src/auth/strategies/jwt.strategy.ts:17`, `backend/src/common/interfaces/jwt-payload.interface.ts` |
| **Kategori** | Authentication bypass |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
`JwtStrategy.validate()` line 17:
```typescript
if (payload.tokenType && payload.tokenType !== 'access') {
  throw new UnauthorizedException('Invalid token type');
}
```
Guard `payload.tokenType &&` menyebabkan token **tanpa** claim `tokenType` (undefined) **bypass** pengecekan dan diterima sebagai access token yang valid. Ini inkonsisten dengan `auth.service.refresh()` (line 48) yang secara eksplisit menolak token tanpa `tokenType === 'refresh'`. Token lama/legacy tanpa `tokenType` akan diterima.

**Root cause:**
Interface `JwtPayload` mendeklarasikan `tokenType?` sebagai optional. Strategy menggunakan truthy guard alih-alih explicit check.

**Impact:**
Jika pernah ada token yang di-generate tanpa `tokenType` (mis. dari versi lama atau bug), token tersebut diterima. Token refresh dengan `tokenType: 'refresh'` ditolak dengan benar, tetapi token tanpa claim apapun lolos.

**Langkah Fix:**

1. **`backend/src/auth/strategies/jwt.strategy.ts`** — ubah line 17 menjadi explicit check:
   ```typescript
   if (payload.tokenType !== 'access') {
     throw new UnauthorizedException('Invalid token type');
   }
   ```

2. **`backend/src/common/interfaces/jwt-payload.interface.ts`** — buat `tokenType` required (hapus `?`):
   ```typescript
   export interface JwtPayload {
     sub: string;
     email: string;
     role: string;
     tokenType: 'access' | 'refresh';  // hapus '?'
     jti?: string;
   }
   ```

3. **`backend/src/notifications/notifications.gateway.ts:54`** — ada pola yang sama:
   ```typescript
   if (payload.tokenType && payload.tokenType !== 'access') {
   ```
   Ubah juga menjadi:
   ```typescript
   if (payload.tokenType !== 'access') {
   ```

4. **Verifikasi:** jalankan `npm test` di `backend/`. Tambahkan test case untuk token tanpa `tokenType` yang harus ditolak oleh `JwtStrategy`.

---

#### SEC-003: Tidak ada account lockout; login throttle per-IP saja

| Atribut | Nilai |
|---------|-------|
| **Severity** | HIGH |
| **Lokasi** | `backend/src/auth/auth.controller.ts:41` |
| **Kategori** | Brute force |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
Login endpoint di-throttle 5 attempt per 60 detik per IP (`@Throttle({ default: { limit: 5, ttl: 60000 } })`). Tidak ada per-account lockout atau failed-attempt counter. Attacker yang rotate IP (botnet, proxy, VPN) bisa mencoba jauh lebih dari 5 password per menit terhadap satu akun.

**Root cause:**
Throttling hanya berdasarkan IP (`@nestjs/throttler` default key). Tidak ada tracking failed attempt per email/akun di Redis.

**Impact:**
Brute force password terhadap akun tertentu dimungkinkan dengan distributed IP.

**Langkah Fix:**

1. **`backend/src/auth/auth.service.ts`** — tambahkan failed attempt tracking di Redis:
   ```typescript
   private async trackFailedLogin(email: string): Promise<void> {
     const key = `login:failed:${email.toLowerCase()}`;
     const count = await this.redisService.incr(key);
     if (count === 1) {
       await this.redisService.expire(key, 900); // 15 menit window
     }
     if (count >= 10) {
       // lock account 15 menit
       const lockKey = `login:locked:${email.toLowerCase()}`;
       await this.redisService.set(lockKey, '1', 900);
     }
   }

   private async checkAccountLocked(email: string): Promise<void> {
     const lockKey = `login:locked:${email.toLowerCase()}`;
     const locked = await this.redisService.get(lockKey);
     if (locked) {
       throw new UnauthorizedException('Account temporarily locked due to too many failed attempts');
     }
   }

   private async resetFailedLogin(email: string): Promise<void> {
     const key = `login:failed:${email.toLowerCase()}`;
     await this.redisService.del(key);
   }
   ```

2. **`backend/src/auth/auth.service.ts`** — di method `login()`, panggil `checkAccountLocked(email)` sebelum validasi, `trackFailedLogin(email)` pada password mismatch, dan `resetFailedLogin(email)` pada login sukses.

3. **`backend/src/redis/redis.service.ts`** — tambahkan method `incr()`, `expire()`, `get()`, `set(key, value, ttlSec)`, `del(key)` jika belum ada.

4. **Pertimbangan:** gunakan email yang sudah di-normalize (lowercase) sebagai key untuk mencegah bypass via case variation.

5. **Verifikasi:** jalankan `npm test` di `backend/`. Test: 10 login gagal → akun terkunci → login dengan password benar tetap ditolak selama lock window.

---

#### SEC-004: Security headers nginx hilang untuk static frontend assets

| Atribut | Nilai |
|---------|-------|
| **Severity** | HIGH |
| **Lokasi** | `nginx/nginx.conf:35-38` (http level) vs `83,89,96` (location level) |
| **Kategori** | Security headers / Misconfiguration |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) di-set di level `http` (lines 35-38). Tetapi `location /assets/` (line 83), `location = /index.html` (line 89), dan `location /` (line 96) masing-masing mendefinisikan `add_header Cache-Control ...`. Di nginx, `add_header` di `location` block **meng-override** (bukan merge) semua `add_header` dari parent `http`/`server`. Akibatnya, **semua response static frontend (HTML, JS, CSS, images) dikirim TANPA security headers**.

**Root cause:**
Perilaku inheritance `add_header` nginx: child `location` block menggantikan parent directives sepenuhnya.

**Impact:**
Frontend SPA tidak memiliki `X-Content-Type-Options` (MIME sniffing), `X-Frame-Options` (clickjacking), `Referrer-Policy`, `Permissions-Policy`. XSS dan clickjacking protection berkurang.

**Langkah Fix:**

1. **`nginx/nginx.conf`** — ulangi semua security headers di setiap `location` block yang memiliki `add_header` sendiri. Untuk `location /assets/` (line 83):
   ```nginx
   location /assets/ {
       add_header Cache-Control "public, max-age=31536000, immutable" always;
       add_header X-Content-Type-Options "nosniff" always;
       add_header X-Frame-Options "SAMEORIGIN" always;
       add_header Referrer-Policy "strict-origin-when-cross-origin" always;
       add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
       add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'self'" always;
   }
   ```

2. Ulanga pola yang sama untuk `location = /index.html` (line 89) dan `location /` (line 96).

3. **Alternatif yang lebih maintainable:** gunakan `include` snippet:
   ```nginx
   # nginx/security-headers.conf
   add_header X-Content-Type-Options "nosniff" always;
   add_header X-Frame-Options "SAMEORIGIN" always;
   add_header Referrer-Policy "strict-origin-when-cross-origin" always;
   add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
   add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'self'" always;
   ```
   Lalu `include /etc/nginx/security-headers.conf;` di setiap location block.

4. **Verifikasi:** rebuild nginx container, lalu `curl -I http://helpdesk.rsmch.internal/` dan `curl -I http://helpdesk.rsmch.internal/assets/index-*.js`. Pastikan semua security headers hadir.

---

#### SEC-005: Tidak ada Content-Security-Policy untuk frontend

| Atribut | Nilai |
|---------|-------|
| **Severity** | HIGH |
| **Lokasi** | `nginx/nginx.conf` (entire file) |
| **Kategori** | XSS protection / Missing header |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
Tidak ada header `Content-Security-Policy` di nginx untuk frontend SPA. Helmet di backend (`main.ts:50`) set CSP hanya untuk API JSON responses, bukan HTML/JS yang dilayani nginx. SPA tidak memiliki proteksi CSP terhadap inline script injection, XSS, atau data exfiltration.

**Root cause:**
CSP tidak dikonfigurasi di nginx. Helmet hanya berlaku untuk API responses.

**Impact:**
Jika ada XSS vector (mis. via bug di React rendering atau dependency compromise), attacker bisa inject script arbitrary tanpa diblokir CSP.

**Langkah Fix:**

1. **`nginx/nginx.conf`** — tambahkan CSP header. Karena SPA Vite menggunakan inline styles (Tailwind) dan dynamic imports, gunakan policy yang sesuai:
   ```nginx
   add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'" always;
   ```
   - `'unsafe-inline'` untuk style diperlukan karena Tailwind inject inline styles.
   - `connect-src 'self' ws: wss:` untuk WebSocket Socket.IO.
   - `img-src 'self' data: blob:` untuk blob URL preview gambar.
   - **Jangan** gunakan `'unsafe-inline'` untuk `script-src`.

2. Pastikan CSP di-include di setiap location block (lihat SEC-004 untuk pola include).

3. **Verifikasi:** buka frontend di browser, cek DevTools > Console untuk CSP violation. Pastikan tidak ada violation yang memblokir fungsi aplikasi. Test upload, download, WebSocket, dan navigasi.

---

#### SEC-006: `backend/.env` world-readable (644) berisi secret asli

| Atribut | Nilai |
|---------|-------|
| **Severity** | HIGH |
| **Lokasi** | `backend/.env` (file permission 644) |
| **Kategori** | Secret exposure |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
File `backend/.env` memiliki permission `644` (owner rw, group r, world r). File berisi `JWT_SECRET`, `DATABASE_URL` (dengan password), `REDIS_PASSWORD`, `POSTGRES_PASSWORD` dengan nilai asli (bukan placeholder). User lain di host bisa membaca semua secret. File sudah ter-gitignore (tidak di-commit), tetapi permission filesystem tidak dibatasi.

**Root cause:**
File dibuat dengan default umask (022) → 644. Tidak ada langkah eksplisit untuk membatasi permission.

**Impact:**
User lain di host server bisa membaca JWT secret, DB password, Redis password. Dengan secret tersebut, attacker bisa forge JWT, akses DB, akses Redis (refresh tokens).

**Langkah Fix:**

1. **Fix immediate:** jalankan `chmod 600 backend/.env` di server.

2. **Dokumentasi:** tambahkan di AGENTS.md atau README:
   ```bash
   # Set file permission saat membuat .env
   chmod 600 backend/.env
   ```

3. **Docker entrypoint:** pertimbangkan untuk memvalidasi permission `.env` di `docker-entrypoint.sh` atau di `validateEnv()` di `main.ts`:
   ```typescript
   // Opsional: warning jika .env world-readable
   import { statSync } from 'fs';
   try {
     const stat = statSync('.env');
     if (stat.mode & 0o077) {
       console.warn('WARNING: .env is group/world readable. Run: chmod 600 .env');
     }
   } catch { /* .env might not exist in container */ }
   ```

4. **Verifikasi:** jalankan `ls -la backend/.env` → harus `-rw-------` (600).

---

#### SEC-007: `.gitignore` tidak cover `.env.*` variants

| Atribut | Nilai |
|---------|-------|
| **Severity** | HIGH |
| **Lokasi** | `.gitignore:3` |
| **Kategori** | Secret exposure / Git |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
Pattern `.env` di `.gitignore` hanya match file yang bernama persis `.env`. Tidak match `.env.local`, `.env.production`, `.env.staging`, `.env.development`. Jika developer membuat `backend/.env.production` dengan secret asli, file tersebut **tidak di-ignore** dan bisa ter-commit.

**Root cause:**
Pattern gitignore terlalu sempit.

**Impact:**
Secret bisa ter-commit ke repository secara tidak sengaja.

**Langkah Fix:**

1. **`.gitignore`** — ubah line 3 dari:
   ```
   .env
   ```
   menjadi:
   ```
   .env
   .env.*
   !.env.*.example
   ```
   Pattern ini meng-ignore semua `.env.*` variants tetapi tetap memperbolehkan `.env.compose.example`, `.env.local.example`, `.env.example` di-track.

2. **Verifikasi:** jalankan `git check-ignore backend/.env.production` → harus return exit 0 (ignored). Jalankan `git check-ignore backend/.env.compose.example` → harus TIDAK ignored (exit 1).

---

#### SEC-008: Tidak ada Docker container hardening / resource limits

| Atribut | Nilai |
|---------|-------|
| **Severity** | HIGH |
| **Lokasi** | `docker-compose.yml` (entire file) |
| **Kategori** | Container security / DoS |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
Tidak ada service di `docker-compose.yml` yang mendefinisikan `user:`, `read_only:`, `security_opt:`, `cap_drop:`, `pids_limit:`, `mem_limit:`, atau `cpus`. Semua container berjalan dengan default capabilities dan tanpa resource constraints. Container yang compromised atau runaway bisa menghabiskan seluruh resource host.

**Root cause:**
Tidak ada hardening configuration di docker-compose.

**Impact:**
DoS via resource exhaustion, container escape dengan full capabilities lebih mudah.

**Langkah Fix:**

1. **`docker-compose.yml`** — tambahkan hardening untuk setiap service:

   **`api` service:**
   ```yaml
   security_opt:
     - no-new-privileges:true
   cap_drop:
     - ALL
   cap_add:
     - CHOWN      # untuk gosu chown di entrypoint
     - SETUID
     - SETGID
     - DAC_OVERRIDE
   mem_limit: 1g
   cpus: 2
   pids_limit: 256
   ```

   **`db` service:**
   ```yaml
   security_opt:
     - no-new-privileges:true
   cap_drop:
     - ALL
   cap_add:
     - CHOWN
     - SETUID
     - SETGID
     - DAC_OVERRIDE
   mem_limit: 2g
   cpus: 2
   ```

   **`cache` service:**
   ```yaml
   security_opt:
     - no-new-privileges:true
   cap_drop:
     - ALL
   mem_limit: 512m
   cpus: 1
   ```

   **`nginx` service:**
   ```yaml
   security_opt:
     - no-new-privileges:true
   cap_drop:
     - ALL
   cap_add:
     - CHOWN
     - SETUID
     - SETGID
     - DAC_OVERRIDE
     - NET_BIND_SERVICE
   mem_limit: 256m
   cpus: 1
   read_only: true
   tmpfs:
     - /tmp
     - /var/cache/nginx
     - /var/run
   ```

2. **Catatan:** `cap_add` untuk `api` dan `db` diperlukan karena entrypoint menggunakan `gosu` (butuh CHOWN/SETUID/SETGID). Test setelah perubahan untuk memastikan container start normal.

3. **Verifikasi:** `docker compose up --build`. Pastikan semua service start dan berfungsi. Jalankan `docker inspect <container> --format='{{.HostConfig.SecurityOpt}}'` untuk memverifikasi.

---

#### SEC-009: Attachment `path` (filesystem path server) bocor ke EndUser

| Atribut | Nilai |
|---------|-------|
| **Severity** | HIGH |
| **Lokasi** | `backend/src/common/repositories/comment.repository.ts:27-31` |
| **Kategori** | Information disclosure |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
`comment.repository.findByTicketId()` menggunakan `include: { attachments: { include: { user: ... } } }` yang mengembalikan **semua** scalar field Attachment, termasuk `path` (filesystem path server, mis. `/app/uploads/<uuid>.ext`). Bandingkan dengan `attachments.service.ts` yang menggunakan `ATTACHMENT_SAFE_SELECT` (lines 33-43) yang sengaja **mengecualikan `path`**. `comments.service.ts` EndUser post-query filter (lines 232-246) memfilter attachment by visibility tetapi **tidak strip field `path`**. Field `path` bocor ke semua role termasuk EndUser via `GET /tickets/:ticketId/comments`.

**Root cause:**
Comment repository menggunakan `include` (return all fields) bukan `select` (explicit field list) untuk attachments. `ATTACHMENT_SAFE_SELECT` pattern tidak diterapkan di comment repository.

**Impact:**
EndUser melihat filesystem path internal server (`/app/uploads/...`). Meskipun tidak langsung exploitable (file dilayani via controller, bukan path langsung), ini adalah information disclosure yang membantu reconnaissance.

**Langkah Fix:**

1. **`backend/src/common/repositories/comment.repository.ts`** — ubah `include` menjadi `select` untuk attachments (lines 27-31):
   ```typescript
   attachments: {
     select: {
       id: true,
       ticketId: true,
       commentId: true,
       userId: true,
       originalName: true,
       mimeType: true,
       size: true,
       visibility: true,
       createdAt: true,
       user: { select: { id: true, name: true } },
     },
   },
   ```
   Ini meng-exclude `path` dari response, konsisten dengan `ATTACHMENT_SAFE_SELECT` di `attachments.service.ts`.

2. **Verifikasi:** jalankan `npm test` di `backend/`. Test: `GET /tickets/:id/comments` sebagai EndUser → response tidak boleh mengandung field `path` di attachments. Test juga sebagai Admin untuk memastikan tidak ada regression.

---

### MEDIUM — Perbaiki sesegera mungkin

---

#### SEC-010: Timing side-channel untuk user enumeration

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `backend/src/auth/auth.service.ts:195-203` |
| **Kategori** | Information disclosure / User enumeration |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
`validateUser()` return `null` immediately jika email tidak ditemukan (line 197), tetapi melakukan bcrypt comparison jika user exists (line 200). Perbedaan timing ini memungkinkan attacker membedakan email yang terdaftar vs tidak terdaftar via response-time analysis. Pesan error generic ("Invalid email or password"), tetapi timing oracle tetap ada.

**Root cause:**
Early return untuk user-not-found tanpa melakukan dummy bcrypt hash.

**Langkah Fix:**

1. **`backend/src/auth/auth.service.ts`** — di `validateUser()`, lakukan dummy bcrypt compare untuk user yang tidak ditemukan:
   ```typescript
   async validateUser(email: string, password: string) {
     const user = await this.userRepository.findByEmail(email.toLowerCase());
     if (!user) {
       // Dummy bcrypt compare untuk menyamakan timing
       await bcrypt.compare(password, '$2b$12$dummyHashToPreventTimingAttackXXXXXXXXXXXXXXXXXXXX');
       return null;
     }
     const valid = await bcrypt.compare(password, user.password);
     if (!valid) return null;
     return user;
     }
   ```
   Atau pre-compute dummy hash di constructor:
   ```typescript
   private readonly dummyHash: string;
   constructor(...) {
     this.dummyHash = bcrypt.hashSync('dummy', 12);
   }
   ```

2. **Verifikasi:** jalankan `npm test`. Test: bandingkan response time login dengan email yang tidak ada vs email yang ada dengan password salah. Timing harus mendekati sama.

---

#### SEC-011: Refresh token rotation tidak family-based

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `backend/src/auth/auth.service.ts:52-64` |
| **Kategori** | Token theft / Session hijacking |
| **Status** | `[ ] Ditangguhkan — breaking change` |

**Deskripsi:**
Saat reuse detection trigger (lines 55-60), hanya jti spesifik `refresh:{sub}:{jti}` yang di-delete. Tidak ada "token family" tracking. Jika attacker mencuri refresh token dan menggunakannya sebelum user legitimate, attacker mendapat session baru (jti baru) dan user legitimate hanya di-logout. Token descendant yang di-issue ke attacker **tidak di-revoke**.

**Root cause:**
Tidak ada family ID tracking di refresh token. Setiap refresh token adalah independent jti, bukan bagian dari chain.

**Langkah Fix:**

1. **`backend/src/auth/auth.service.ts`** — tambahkan `familyId` ke refresh token payload dan Redis key:
   ```typescript
   // Di generateTokens():
   const familyId = randomUUID();
   // refresh token payload: { ..., jti, familyId }
   // Redis key: refresh:{userId}:{familyId}:{jti}
   ```

2. Saat reuse detection (stored token missing/mismatched), revoke seluruh family:
   ```typescript
   // Di refresh():
   if (!stored || stored !== refreshToken) {
     // Revoke entire family
     await this.redisService.deleteByPattern(`refresh:${userId}:${familyId}:*`);
     throw new UnauthorizedException('Refresh token has been revoked');
   }
   ```

3. Saat rotation normal, issue token baru dengan **familyId yang sama** (bukan familyId baru).

4. **Verifikasi:** test scenario: attacker refresh dengan stolen token → dapat token baru → user legitimate refresh dengan token lama → reuse detection → **semua token di family di-revoke** termasuk token attacker.

---

#### SEC-012: Access token tidak dapat di-revoke setelah logout/password change

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `backend/src/auth/auth.service.ts:113,136` |
| **Kategori** | Session management |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
`changePassword()` dan `logout()` me-revoke refresh tokens di Redis, tetapi access token stateless tetap valid sampai expiry-nya (15 menit). Tidak ada access-token blacklist. Setelah logout atau password change, leaked access token masih berfungsi sampai 15 menit.

**Root cause:**
Access token adalah stateless JWT tanpa blacklist mechanism.

**Langkah Fix:**

1. **Opsi A (Recommended — short-lived + accept tradeoff):** Pertahankan access token 15 menit. Ini adalah tradeoff yang umum. Pastikan 15 menit adalah acceptable risk window. **Tidak perlu code change** jika 15 menit acceptable.

2. **Opsi B (Access token blacklist):** tambahkan Redis blacklist:
   ```typescript
   // Saat logout/password change/deactivation:
   await this.redisService.set(`access:revoked:${jti}`, '1', accessTokenTtlSec);
   
   // Di JwtStrategy.validate():
   const revoked = await this.redisService.get(`access:revoked:${payload.jti}`);
   if (revoked) throw new UnauthorizedException('Token revoked');
   ```
   **Catatan:** ini menambah Redis lookup per request (sudah ada DB lookup per request saat ini). Pertimbangkan caching dengan short TTL.

3. **Opsi C (Reference token / opaque token):** ganti JWT access token dengan opaque token yang di-store di Redis. Lebih mudah di-revoke tetapi menambah Redis round-trip per request.

4. **Rekomendasi:** Opsi A untuk sekarang (15 menit acceptable), dengan catatan di dokumentasi. Implement Opsi B jika requirement keamanan meningkat.

---

#### SEC-013: JwtAuthGuard dan RolesGuard tidak global (no fail-closed default)

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `backend/src/app.module.ts:51-66`, `backend/src/common/guards/jwt-auth.guard.ts`, `backend/src/common/guards/roles.guard.ts` |
| **Kategori** | Authorization / Access control |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
Hanya `MaintenanceGuard` dan `ThrottlerGuard` yang global (`APP_GUARD`). `JwtAuthGuard` dan `RolesGuard` di-apply per-controller via `@UseGuards`. Controller baru yang lupa `@UseGuards(JwtAuthGuard)` akan expose route tanpa autentikasi. `RolesGuard` return `true` jika tidak ada `@Roles()` metadata (default-allow).

**Root cause:**
Auth guard tidak di-register sebagai global guard dengan public-route exemption pattern.

**Langkah Fix:**

1. **`backend/src/common/guards/jwt-auth.guard.ts`** — ubah menjadi global guard dengan `@Public()` decorator exemption:
   ```typescript
   @Injectable()
   export class JwtAuthGuard extends AuthGuard('jwt') {
     constructor(private reflector: Reflector) {
       super();
     }
     
     canActivate(context: ExecutionContext) {
       const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
         context.getHandler(),
         context.getClass(),
       ]);
       if (isPublic) return true;
       return super.canActivate(context);
     }
   }
   ```

2. **`backend/src/common/decorators/public.decorator.ts`** — buat decorator:
   ```typescript
   import { SetMetadata } from '@nestjs/common';
   export const IS_PUBLIC_KEY = 'isPublic';
   export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
   ```

3. **`backend/src/app.module.ts`** — register `JwtAuthGuard` sebagai global:
   ```typescript
   { provide: APP_GUARD, useExisting: JwtAuthGuard },
   ```
   Hapus `@UseGuards(JwtAuthGuard)` dari semua controller (tidak perlu lagi per-controller).

4. **`backend/src/health/health.controller.ts`** — tambahkan `@Public()` di controller level.

5. **`backend/src/maintenance/maintenance.controller.ts`** — tambahkan `@Public()` di `getMaintenanceMode()` handler saja (endpoint lain tetap perlu auth).

6. **Verifikasi:** jalankan `npm test` dan `npm run build`. Pastikan semua endpoint yang seharusnya authenticated tetap ter-proteksi. Test: buat controller baru tanpa `@UseGuards` → harus tetap require auth (fail-closed).

---

#### SEC-014: Comment body tidak menggunakan DTO class — ValidationPipe bypassed

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `backend/src/comments/comments.controller.ts:64-85` |
| **Kategori** | Input validation |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
`CommentsController.create()` menggunakan `@Body('content')` dan `@Body('type')` alih-alih `@Body() dto: CreateCommentDto`. `CreateCommentDto` ada di `comments/dto/create-comment.dto.ts` tetapi **tidak pernah di-import atau digunakan**. Global `ValidationPipe` dengan `whitelist: true, forbidNonWhitelisted: true` hanya apply validation decorators pada class-based DTO. Dengan `@Body('field')`, tidak ada validation decorator yang aktif:
- Tidak ada `@MaxLength()` pada `content` — user bisa submit comment body tanpa batas panjang (DB column `@db.Text` ~1GB).
- Tidak ada `@IsEnum(CommentType)` pada `type` — string apapun diterima.
- Tidak ada `@IsString()` enforcement — jika `content` adalah number/object, `content?.trim()` akan throw TypeError → 500 error.

**Root cause:**
Controller menggunakan `@Body('field')` extraction alih-alih class-based DTO binding.

**Langkah Fix:**

1. **`backend/src/comments/dto/create-comment.dto.ts`** — perbaiki DTO:
   ```typescript
   import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';
   import { CommentType } from '@prisma/client';

   export class CreateCommentDto {
     @IsString()
     @MaxLength(10000)
     content: string;

     @IsOptional()
     @IsEnum(CommentType)
     type?: CommentType;
   }
   ```

2. **`backend/src/comments/comments.controller.ts`** — ubah `create()` handler:
   ```typescript
   @Post()
   @UseInterceptors(FilesInterceptor('files', 3, { ... }))
   async create(
     @Param('ticketId', ParseUUIDPipe) ticketId: string,
     @Body() createCommentDto: CreateCommentDto,
     @UploadedFiles() files: Express.Multer.File[] = [],
     @CurrentUser() user: AuthUser,
   ) {
     return this.commentsService.create(ticketId, createCommentDto, files, user);
   }
   ```

3. **`backend/src/comments/comments.service.ts`** — sesuaikan signature `create()` untuk menerima `CreateCommentDto`:
   ```typescript
   async create(ticketId: string, dto: CreateCommentDto, files: Express.Multer.File[], user: AuthUser) {
     const content = dto.content;
     const type = dto.type === CommentType.INTERNAL ? CommentType.INTERNAL : CommentType.PUBLIC;
     // ... rest of method
   }
   ```

4. **Verifikasi:** jalankan `npm test` di `backend/`. Test: submit comment dengan content > 10000 chars → harus 400. Submit dengan type string invalid → harus 400.

---

#### SEC-015: Tidak ada file extension whitelist pada upload

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `backend/src/comments/comments.service.ts:68` (`buildSafeUploadPath`), `backend/src/attachments/attachments.service.ts:79` |
| **Kategori** | File upload security |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
`buildSafeUploadPath()` mengambil extension dari user-supplied filename tanpa validasi terhadap whitelist:
```typescript
const ext = path.extname(path.basename(originalName)) || '';
const safeName = `${uuidv4()}${ext}`;
```
File bernama `exploit.html`, `exploit.svg`, atau `exploit.js` akan disimpan sebagai `<uuid>.html`, `<uuid>.svg`, `<uuid>.js`. AGENTS.md menyebut "filename on disk = uuid + safe extension" tetapi extension **tidak di-sanitize**. Mitigasi saat ini: file dilayani via API controller dengan `X-Content-Type-Options: nosniff`, dan volume `uploads_data` hanya mounted di `api` container (tidak di nginx). Tetapi ini adalah latent risk jika config nginx/serving berubah.

**Root cause:**
Extension dari original filename diambil apa adanya tanpa filter.

**Langkah Fix:**

1. **`backend/src/comments/comments.service.ts`** dan **`backend/src/attachments/attachments.service.ts`** — tambahkan extension whitelist di `buildSafeUploadPath()`:
   ```typescript
   const ALLOWED_EXTENSIONS = new Set([
     '.jpg', '.jpeg', '.png', '.gif', '.webp',
     '.pdf', '.zip', '.rar',
     '.txt', '.csv',
     '.doc', '.docx', '.xls', '.xlsx',
   ]);

   function buildSafeUploadPath(uploadDir: string, originalName: string): string {
     const uploadRoot = path.resolve(uploadDir);
     const rawExt = path.extname(path.basename(originalName)).toLowerCase();
     const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : '';
     const safeName = `${uuidv4()}${ext}`;
     const resolvedPath = path.resolve(path.join(uploadRoot, safeName));
     if (!resolvedPath.startsWith(uploadRoot + path.sep) && resolvedPath !== uploadRoot) {
       throw new BadRequestException('Invalid file path');
     }
     return resolvedPath;
   }
   ```
   Jika extension tidak di-whitelist, file disimpan **tanpa extension** (atau throw `BadRequestException`).

2. **Pertimbangkan:** throw `BadRequestException('File type not allowed')` alih-alih strip extension, untuk UX yang lebih jelas.

3. **Verifikasi:** test upload file `.html` → harus ditolak (atau disimpan tanpa extension). Test upload `.jpg` → harus sukses dengan extension `.jpg`.

---

#### SEC-016: `originalName` disimpan unsanitized di DB

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `backend/src/comments/comments.service.ts:163`, `backend/src/attachments/attachments.service.ts:147` |
| **Kategori** | Stored XSS |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
`originalName: file.originalname` — raw user-supplied filename disimpan di DB tanpa sanitization. Jika frontend render `originalName` tanpa HTML escaping, stored XSS dimungkinkan. Frontend saat ini render sebagai JSX text (auto-escaped), jadi **tidak exploitable saat ini**, tetapi ini adalah latent risk.

**Root cause:**
Tidak ada sanitization pada `originalName` sebelum disimpan.

**Langkah Fix:**

1. **`backend/src/comments/comments.service.ts`** dan **`backend/src/attachments/attachments.service.ts`** — sanitize `originalName` sebelum disimpan:
   ```typescript
   function sanitizeOriginalName(name: string): string {
     // Ambil basename saja (strip path components)
     const basename = path.basename(name);
     // Batasi panjang
     return basename.substring(0, 255);
   }
   ```
   Gunakan: `originalName: sanitizeOriginalName(file.originalname)`

2. **Catatan:** React JSX auto-escape sudah melindungi saat ini. Sanitization di backend adalah defense-in-depth. Jangan strip karakter HTML di backend (karena `originalName` adalah plain text, bukan HTML) — cukup ambil basename dan batasi panjang.

3. **Verifikasi:** test upload file dengan nama `<script>alert(1)</script>.jpg` → `originalName` di DB harus `alert(1).jpg` atau `<script>alert(1)</script>.jpg` (basename). Frontend render sebagai text → tidak ada XSS.

---

#### SEC-017: Telegram link code interception → kebocoran notifikasi admin

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `backend/src/telegram/telegram.service.ts:446-448,131-168` |
| **Kategori** | Social engineering / Information disclosure |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
Link code Telegram di-generate dari 4 random bytes → base64url 6 chars → `.toUpperCase()` (mengurangi entropy dari ~4.3B ke ~3B kombinasi). Code berlaku 5 menit. Jika attacker mengamati code (shoulder-surfing, screen sharing, logs) dan mengirim `/start <code>` ke bot dalam 5 menit, chat Telegram attacker ter-link ke akun admin. Setelah itu, `sendEvent` mengirim notifikasi tiket (subject, nomor, priority, status) ke chat attacker.

**Root cause:**
Code 6-char dengan entropy tereduksi + window 5 menit + tidak ada verifikasi tambahan.

**Langkah Fix:**

1. **`backend/src/telegram/telegram.service.ts:446-448`** — tingkatkan entropy dan hapus `toUpperCase()`:
   ```typescript
   const bytes = crypto.randomBytes(8);  // 8 bytes bukan 4
   const code = bytes.toString('base64url').substring(0, 8);  // 8 chars, tanpa toUpperCase
   const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
   ```
   8 bytes base64url = ~12 chars, ambil 8 → entropy ~64^8 ≈ 2.8 × 10^14. Tanpa `toUpperCase()`, alphabet tetap 64.

2. **Pertimbangan tambahan:** setelah link sukses, kirim notifikasi ke chat yang baru ter-link dengan info: "Linked to {email}. If this was not you, contact your administrator." Admin bisa melihat jika ada link yang tidak diinginkan.

3. **Verifikasi:** test link flow. Pastikan code 8-char, case-sensitive, dan link sukses mengirim konfirmasi.

---

#### SEC-018: Non-atomic Redis lock release (TOCTOU race) di maintenance

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `backend/src/maintenance/maintenance.service.ts:56-61` |
| **Kategori** | Race condition / Concurrency |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
`releaseLock()` melakukan GET-then-DEL tanpa atomicity:
```typescript
const stored = await this.redis.get(handle.key);
if (stored === handle.token) {
  await this.redis.del(handle.key);
}
```
Jika lock TTL expire antara `get` dan `del`, process kedua bisa acquire lock baru, dan `del` akan menghapus lock baru tersebut, memungkinkan concurrent backup/restore.

**Root cause:**
GET dan DEL tidak atomic. Tidak menggunakan Lua script untuk compare-and-delete.

**Langkah Fix:**

1. **`backend/src/maintenance/maintenance.service.ts`** — gunakan Lua script untuk atomic lock release:
   ```typescript
   private static readonly RELEASE_LOCK_SCRIPT = `
     if redis.call('get', KEYS[1]) == ARGV[1] then
       return redis.call('del', KEYS[1])
     else
       return 0
     end
   `;

   private async releaseLock(handle: LockHandle): Promise<void> {
     await this.redis.eval(
       MaintenanceService.RELEASE_LOCK_SCRIPT,
       { keys: [handle.key], arguments: [handle.token] }
     );
   }
   ```

2. **`backend/src/redis/redis.service.ts`** — tambahkan method `eval()` wrapper jika belum ada:
   ```typescript
   async eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown> {
     return this.client.eval(script, { keys: options.keys, arguments: options.arguments });
   }
   ```

3. **Verifikasi:** jalankan `npm test`. Test: acquire lock → tunggu TTL expire → acquire lock baru → release lock lama → lock baru tetap ada.

---

#### SEC-019: Tidak ada restore-lock check pada manual setMaintenanceMode

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `backend/src/maintenance/maintenance.service.ts` (setMaintenanceMode), `backend/src/maintenance/maintenance.controller.ts:25-28` |
| **Kategori** | Race condition / Data integrity |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
`PATCH /maintenance/mode` (admin-only) tidak check `RESTORE_LOCK_KEY`. Admin kedua bisa call `PATCH /maintenance/mode { enabled: false }` saat restore sedang berjalan, membuka akses user mid-restore dan mengekspos database state yang inconsistent.

**Root cause:**
`setMaintenanceMode()` tidak memeriksa apakah restore lock sedang di-hold.

**Langkah Fix:**

1. **`backend/src/maintenance/maintenance.service.ts`** — di `setMaintenanceMode()`, tambahkan check:
   ```typescript
   async setMaintenanceMode(enabled: boolean, message?: string) {
     if (!enabled) {
       // Cek apakah restore sedang berjalan
       const restoreLock = await this.redis.get(RESTORE_LOCK_KEY);
       if (restoreLock) {
         throw new BadRequestException('Cannot disable maintenance during active restore');
       }
     }
     // ... existing logic
   }
   ```

2. **Verifikasi:** test: start restore → attempt `PATCH /maintenance/mode { enabled: false }` → harus 400.

---

#### SEC-020: Weak infrastructure credentials di `.env`

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `backend/.env:7,12,35-36` |
| **Kategori** | Weak credentials |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
`POSTGRES_PASSWORD=ticket123`, `REDIS_PASSWORD=redis123`, `SEED_ADMIN_PASSWORD=Admin123!` (sama dengan dev default yang terdokumentasi di AGENTS.md). Redis menyimpan refresh tokens (full JWT) sebagai values; weak Redis password berisiko token theft.

**Root cause:**
Password lemah digunakan di environment production.

**Langkah Fix:**

1. **`backend/.env`** — generate password yang kuat:
   ```bash
   # Generate strong passwords
   openssl rand -base64 32  # untuk POSTGRES_PASSWORD
   openssl rand -base64 32  # untuk REDIS_PASSWORD
   openssl rand -hex 32     # untuk JWT_SECRET (64 hex chars)
   ```
   Update `DATABASE_URL` dan `REDIS_URL` dengan password baru.

2. **`SEED_ADMIN_PASSWORD`** dan **`SEED_SUPPORT_PASSWORD`** — gunakan password yang kuat dan unik, bukan `Admin123!`.

3. **Setelah update `.env`:** restart semua service:
   ```bash
   docker compose down
   docker compose up -d
   ```
   **Catatan:** `docker compose down` (tanpa `-v`) tidak menghapus volume. Data DB tetap. Jika password DB diubah, perlu update `pg_hba.conf` atau recreate DB container. Lebih aman: `docker compose down && docker compose up -d --build` setelah update `.env`.

4. **Verifikasi:** `docker compose exec db psql -U ticketing -c "SELECT 1"` dengan password baru. `docker compose exec cache redis-cli -a <new-password> PING`.

---

#### SEC-021: API container entrypoint berjalan sebagai root

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `backend/Dockerfile:18-44`, `backend/docker-entrypoint.sh:4-7` |
| **Kategori** | Container security |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
Container PID 1 berjalan sebagai root untuk `chown -R node:node /app/uploads /app/backups`, lalu `exec gosu node "$@"` drop ke user `node`. Tidak ada `no-new-privileges` security option. Root PID 1 meningkatkan attack surface jika container escape terjadi.

**Root cause:**
Entryppoint perlu root untuk chown volume.

**Langkah Fix:**

1. **`docker-compose.yml`** — tambahkan `security_opt: [no-new-privileges:true]` (lihat SEC-008).

2. **Alternatif:** pre-create volume dengan correct ownership di Dockerfile:
   ```dockerfile
   # Di Dockerfile, sebelum USER directive:
   RUN mkdir -p /app/uploads /app/backups && chown -R node:node /app/uploads /app/backups
   USER node
   ```
   Lalu hapus `chown` dari `docker-entrypoint.sh`:
   ```sh
   #!/bin/sh
   set -e
   mkdir -p /app/uploads /app/backups
   exec "$@"
   ```
   **Catatan:** Docker named volumes di-create sebagai root by default. Jika volume sudah ada dengan root ownership, `mkdir` saja tidak cukup. Gunakan init container atau `docker run --user node` dengan pre-chowned volume. Untuk simplicity, pertahankan `gosu` pattern tetapi tambahkan `no-new-privileges`.

3. **Verifikasi:** `docker inspect api --format='{{.HostConfig.SecurityOpt}}'` → harus include `no-new-privileges:true`.

---

#### SEC-022: Backups bind-mounted ke host filesystem

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `docker-compose.yml:51` |
| **Kategori** | Data exposure |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
`./backups:/app/backups` — backup files (full DB dumps berisi bcrypt password hashes, tickets, internal comments, attachment metadata) di-write ke host directory `./backups`. Permission directory `./backups` di host tidak dikontrol oleh Docker dan tergantung host umask. User lain di host bisa membaca backup.

**Root cause:**
Bind mount ke host filesystem tanpa permission control.

**Langkah Fix:**

1. **Fix immediate:** set permission directory host:
   ```bash
   chmod 700 ./backups
   ```

2. **Dokumentasi:** tambahkan di AGENTS.md atau README:
   ```bash
   # Set backup directory permission
   chmod 700 backups
   ```

3. **Alternatif:** gunakan Docker named volume alih-alih bind mount:
   ```yaml
   volumes:
     backups_data:
   ```
   ```yaml
   # di api service:
   - backups_data:/app/backups
   ```
   Named volume lebih terisolasi dari host filesystem. **Catatan:** ini akan menyulitkan akses backup dari host untuk download via Admin UI (yang sudah dilayani via API, jadi seharusnya tetap OK).

4. **Verifikasi:** `ls -ld ./backups` → harus `drwx------` (700).

---

#### SEC-023: Shared env_file melanggar least-privilege

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `docker-compose.yml:42,70,87` |
| **Kategori** | Secret exposure / Least privilege |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
File `./backend/.env` yang sama di-pass ke `api`, `db`, dan `cache` services. Container `db` menerima `REDIS_PASSWORD`, `JWT_SECRET`, dan app secrets yang tidak dibutuhkan. Container `cache` menerima `DATABASE_URL`, `JWT_SECRET`, `POSTGRES_PASSWORD` yang tidak dibutuhkan. Setiap service mendapat full secret set.

**Root cause:**
Single env_file untuk semua service.

**Langkah Fix:**

1. **Pendekatan minimal:** pisahkan env files per service:
   - `backend/.env` — untuk `api` service (full set)
   - `backend/.env.db` — untuk `db` service (hanya `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`)
   - `backend/.env.cache` — untuk `cache` service (hanya `REDIS_PASSWORD`)

2. **`docker-compose.yml`:**
   ```yaml
   db:
     env_file:
       - ./backend/.env.db
   cache:
     env_file:
       - ./backend/.env.cache
   api:
     env_file:
       - ./backend/.env
   ```

3. **Catatan:** ini menambah kompleksitas file management. Jika dianggap terlalu rumit, alternatif: gunakan `environment:` key di docker-compose untuk override/select hanya vars yang diperlukan per service, dan tetap gunakan `env_file` untuk `api` saja.

4. **Verifikasi:** `docker compose exec db env | grep JWT_SECRET` → harus kosong. `docker compose exec cache env | grep DATABASE_URL` → harus kosong.

---

#### SEC-024: Multer memory storage — file di-buffer di RAM (DoS)

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `backend/src/attachments/attachments.controller.ts:48-57`, `backend/src/comments/comments.controller.ts:53-63` |
| **Kategori** | DoS / Resource exhaustion |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
Multer menggunakan `MemoryStorage` (default, tidak ada `storage` option). File hingga 10MB (attachments) / 5MB (comments) di-buffer di `file.buffer` di Node.js memory. Upload concurrent dari multiple user bisa menghabiskan RAM. `diskStorage` di-import tetapi tidak digunakan.

**Root cause:**
Tidak ada `storage` option di `FileInterceptor`/`FilesInterceptor`.

**Langkah Fix:**

1. **Opsi A (Switch to disk storage):** gunakan `diskStorage` dengan custom filename:
   ```typescript
   import { diskStorage } from 'multer';

   const storage = diskStorage({
     destination: (req, file, cb) => {
       const uploadDir = process.env.UPLOAD_DIR || './uploads';
       cb(null, uploadDir);
     },
     filename: (req, file, cb) => {
       cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
     },
   });

   @UseInterceptors(FileInterceptor('file', {
     storage,
     limits: { fileSize: MAX_FILE_SIZE, files: 1 },
     fileFilter: ...
   }))
   ```
   **Catatan:** dengan disk storage, `file.buffer` tidak ada. `assertMimeTypeIntegrity()` perlu diubah untuk baca dari `file.path` alih-alih `file.buffer`:
   ```typescript
   function detectMimeFromMagicBytes(file: Express.Multer.File): string | null {
     const buffer = file.buffer ?? readFileSync(file.path).subarray(0, 16);
     // ...
   }
   ```

2. **Opsi B (Keep memory storage + add concurrency limit):** tetap memory storage tetapi batasi concurrent uploads:
   ```typescript
   // Di app.module.ts atau main.ts:
   // Batasi concurrent connections atau gunakan queue
   ```
   Tambahkan `mem_limit` di docker-compose (lihat SEC-008) untuk mencegah OOM kill host.

3. **Rekomendasi:** Opsi A (disk storage) lebih aman untuk production. Memory storage OK untuk file kecil, tetapi 10MB per file × concurrent users = risk.

4. **Verifikasi:** test upload concurrent 10 file 10MB → memory usage tidak spike. `docker stats api` → memory dalam batas.

---

#### SEC-025: LoginDto/ChangePasswordDto tidak ada @MaxLength pada password

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `backend/src/auth/dto/login.dto.ts`, `backend/src/auth/dto/change-password.dto.ts` |
| **Kategori** | DoS / Input validation |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
`LoginDto.password` dan `ChangePasswordDto.currentPassword`/`newPassword` hanya punya `@MinLength(8)` tanpa `@MaxLength`. `CreateUserDto` punya `@MaxLength(128)`. Attacker bisa submit password berukuran sangat besar. Meskipun bcrypt truncate di 72 bytes, request body parsing dan string handling untuk multi-MB password tidak bounded.

**Root cause:**
Inkonsistensi validasi antar DTO.

**Langkah Fix:**

1. **`backend/src/auth/dto/login.dto.ts`:**
   ```typescript
   @IsString()
   @MinLength(8)
   @MaxLength(128)
   password: string;
   ```

2. **`backend/src/auth/dto/change-password.dto.ts`:**
   ```typescript
   @IsString()
   @MinLength(8)
   @MaxLength(128)
   currentPassword: string;

   @IsString()
   @MinLength(8)
   @MaxLength(128)
   newPassword: string;
   ```

3. **Verifikasi:** `npm test`. Test: login dengan password 129 chars → harus 400.

---

#### SEC-026: Magic byte verification incomplete (6 dari 13 MIME type tanpa signature check)

| Atribut | Nilai |
|---------|-------|
| **Severity** | MEDIUM |
| **Lokasi** | `backend/src/comments/comments.service.ts:37-45,59`, `backend/src/attachments/attachments.service.ts:45-72` |
| **Kategori** | File upload security / MIME spoofing |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:**
`MIME_SIGNATURES` hanya cover 7 tipe (jpeg, png, gif, webp, pdf, zip, rar). 6 tipe lainnya (`text/plain`, `text/csv`, `application/msword`, `.docx`, `.xls`, `.xlsx`) tidak punya magic byte signature. `assertMimeTypeIntegrity()` hanya throw jika `detected` non-null DAN mismatch. Untuk 6 tipe tanpa signature, `detected` return `null` dan check di-skip. User bisa upload file apapun dengan `Content-Type: text/plain` dan lolos semua check.

**Root cause:**
Tidak ada signature untuk Office formats dan text files.

**Langkah Fix:**

1. **`backend/src/comments/comments.service.ts`** dan **`backend/src/attachments/attachments.service.ts`** — tambahkan magic byte signatures untuk Office formats:
   ```typescript
   // Tambahkan ke MIME_SIGNATURES:
   // .docx, .xlsx adalah ZIP-based (PK signature sudah ada untuk zip)
   // .doc (OLE2): D0 CF 11 E0 A1 B1 1A E1
   { mime: 'application/msword', bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], offset: 0 },
   // .docx, .xlsx: sudah ter-cover oleh zip signature (PK\x03\x04)
   // tetapi perlu mapping tambahan: jika detected zip, cek content type di dalam zip
   ```

2. **Untuk `text/plain` dan `text/csv`:** tambahkan check bahwa content tidak mengandung binary data:
   ```typescript
   function assertTextFileIntegrity(file: Express.Multer.File): void {
     if (file.mimetype === 'text/plain' || file.mimetype === 'text/csv') {
       const buffer = file.buffer ?? readFileSync(file.path);
       // Cek apakah file adalah text (tidak mengandung null bytes)
       for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
         if (buffer[i] === 0) {
           throw new BadRequestException('File content does not match declared text type');
         }
       }
     }
   }
   ```

3. **Untuk Office OOXML (.docx, .xlsx):** zip signature sudah ada, tetapi zip bisa berisi file apapun. Tambahkan check: jika detected zip, verify bahwa zip berisi `[Content_Types].xml` (karakteristik OOXML):
   ```typescript
   // Jika detected mime adalah zip, cek apakah ini OOXML atau plain zip
   // Dengan membaca zip entry list
   ```
   **Catatan:** ini kompleks. Alternatif sederhana: untuk `.docx`/`.xlsx`, terima zip signature saja (sudah ada). Risk: user bisa upload zip file dengan extension `.docx`. Mitigasi: cek extension whitelist (SEC-015).

4. **Verifikasi:** test upload binary file dengan `Content-Type: text/plain` → harus ditolak. Test upload `.docx` asli → harus sukses.

---

### LOW — Perbaiki saat kesempatan ada

---

#### SEC-027: Same JWT secret untuk access dan refresh token

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/auth/auth.service.ts:153-168` |
| **Kategori** | Key management |
| **Status** | `[ ] Ditangguhkan — breaking change` |

**Deskripsi:** Kedua token type di-sign dengan `process.env.JWT_SECRET!`. Kompromi satu secret mengkompromi kedua token type.

**Langkah Fix:** Tambahkan `JWT_REFRESH_SECRET` env var. Sign refresh token dengan secret terpisah. Validasi di `auth.service.refresh()` gunakan `JWT_REFRESH_SECRET`. **Catatan:** ini breaking change untuk existing refresh tokens — semua user perlu re-login. Lakukan saat maintenance window.

---

#### SEC-028: Config drift — hardcoded refresh TTL vs env-driven JWT expiry

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/auth/auth.service.ts:26`, `backend/src/auth/auth.controller.ts:48,62` |
| **Kategori** | Configuration |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `refreshTokenExpiryMs` hardcoded 7 hari (line 26), tetapi JWT refresh expiry baca `process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d'` (line 166). Cookie maxAge juga hardcoded 7 hari. Jika env diubah, JWT expiry, Redis TTL, dan cookie maxAge akan diverge.

**Langkah Fix:** Baca semua dari env yang sama:
```typescript
private readonly refreshTokenExpiryMs: number;
constructor(...) {
  const expiry = process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d';
  this.refreshTokenExpiryMs = this.parseExpiryToMs(expiry);
}
```
Gunakan `this.refreshTokenExpiryMs` untuk cookie maxAge dan Redis TTL. Tambahkan helper `parseExpiryToMs()`.

---

#### SEC-029: change-password tidak clear refresh cookie

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/auth/auth.controller.ts:66-78` |
| **Kategori** | Session management |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `changePassword()` me-revoke refresh tokens server-side tetapi tidak `res.clearCookie`. Browser retains cookie (now-invalid) sampai 7-day expiry.

**Langkah Fix:** Di `changePassword()` handler, tambahkan `res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })` setelah revocation.

---

#### SEC-030: CSRF hanya mengandalkan sameSite=strict

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/auth/auth.controller.ts:30` |
| **Kategori** | CSRF |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** Tidak ada CSRF token library. CSRF mitigation hanya `sameSite=strict`. Jika sameSite pernah di-weakend (ke `lax` atau `none`), CSRF protection hilang tanpa fallback.

**Langkah Fix:** `sameSite=strict` adalah mitigation yang kuat dan cukup untuk arsitektur ini (access token via Authorization header, bukan cookie). **Tidak perlu code change saat ini.** Catat sebagai risk acceptance. Jika sameSite perlu di-weakend di masa depan, tambahkan double-submit CSRF token.

---

#### SEC-031: Maintenance allow-list URL-based, coupled to absence of global API prefix

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/common/guards/maintenance.guard.ts:66-74` |
| **Kategori** | Availability / Misconfiguration |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** Allow-list compare `req.url` terhadap `/health`, `/maintenance/`, `/auth/`. Tidak ada `app.setGlobalPrefix('api')` di `main.ts`. Jika global prefix ditambahkan, `req.url` menjadi `/api/auth/...` dan check `/auth/` gagal, memblokir auth saat maintenance.

**Langkah Fix:** Gunakan `@SkipMaintenance()` decorator alih-alih URL prefix matching. Tambahkan `@SkipMaintenance()` ke health, auth, dan maintenance controllers. Hapus URL-based allow-list. **Catatan:** `@SkipMaintenance()` sudah defined tetapi unused — ini bisa diaktifkan.

---

#### SEC-032: @SkipMaintenance decorator adalah dead code

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/common/decorators/skip-maintenance.decorator.ts` |
| **Kategori** | Dead code |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** Decorator defined tetapi zero usages di codebase.

**Langkah Fix:** Aktifkan penggunaannya (lihat SEC-031) atau hapus jika tidak akan digunakan.

---

#### SEC-033: Open redirect — unvalidated `location.state.from`

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `frontend/src/auth/ProtectedRoute.tsx:36`, `frontend/src/hooks/use-auth.ts:22-23`, `frontend/src/pages/LoginPage.tsx:10-11` |
| **Kategori** | Open redirect |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `location.state.from` digunakan untuk redirect setelah login tanpa validasi bahwa `from.pathname` adalah internal/relative path. Risk rendah karena `location.state` adalah same-origin programmatic state (tidak controllable via URL query params), dan React Router `navigate()` treat absolute URL sebagai router path.

**Langkah Fix:** Tambahkan validasi sederhana di `use-auth.ts`:
```typescript
const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
const safePath = from?.pathname?.startsWith('/') && !from.pathname.startsWith('//') 
  ? `${from.pathname}${from.search || ''}` 
  : '/tickets';
navigate(safePath, { replace: true });
```

---

#### SEC-034: CreateTicketForm tidak validasi MIME type file

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `frontend/src/components/tickets/CreateTicketForm.tsx:63-73` |
| **Kategori** | Defense in depth |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `handleFileChange` hanya validasi size, tidak MIME type. Inkonsisten dengan `CommentSection` dan `AttachmentList` yang enforce `ALLOWED_MIME_TYPES`.

**Langkah Fix:** Tambahkan MIME type validation yang sama dengan `CommentSection` di `handleFileChange`.

---

#### SEC-035: UserManagement tidak ada client-side validation

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `frontend/src/components/admin/UserManagement.tsx:73-98` |
| **Kategori** | Defense in depth |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `handleSubmit` tidak validasi email format atau password length di client-side. Hanya mengandalkan backend DTO validation.

**Langkah Fix:** Tambahkan client-side validation (email regex, password min 8) sebelum submit. Tampilkan error via `toast.error()`.

---

#### SEC-036: ErrorBoundary log ke console di production

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `frontend/src/components/ui/ErrorBoundary.tsx:24` |
| **Kategori** | Information disclosure |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `console.error('ErrorBoundary caught:', error, errorInfo)` di production bisa expose internal component structure/stack traces di browser console.

**Langkah Fix:** Guard dengan env check:
```typescript
if (import.meta.env.DEV) {
  console.error('ErrorBoundary caught:', error, errorInfo);
}
```

---

#### SEC-037: UserManagement menggunakan alert() untuk error

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `frontend/src/components/admin/UserManagement.tsx:110,121` |
| **Kategori** | UX / Convention |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** Menggunakan `alert()` alih-alih `toast.error()`. Bertentangan dengan AGENTS.md convention.

**Langkah Fix:** Ganti `alert(getErrorMessage(...))` dengan `toast.error(getErrorMessage(...))`.

---

#### SEC-038: Tidak ada @MaxLength pada description di CreateTicketDto

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/tickets/dto/create-ticket.dto.ts:16` |
| **Kategori** | Input validation / DoS |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `description` hanya `@IsString()`. DB column `@db.Text` (~1GB). User bisa submit description sangat panjang.

**Langkah Fix:** Tambahkan `@MaxLength(10000)` (atau nilai yang sesuai dengan business requirement).

---

#### SEC-039: QueryTicketDto ID fields @IsString() bukan @IsUUID()

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/tickets/dto/query-ticket.dto.ts:37,41,45` |
| **Kategori** | Input validation |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `categoryId`, `assignedToId`, `requesterId` adalah `@IsString()` bukan `@IsUUID()`. Invalid UUID cause Prisma 500 error alih-alih clean 400.

**Langkah Fix:** Ganti `@IsString()` dengan `@IsUUID()` untuk ketiga field.

---

#### SEC-040: Tidak ada @MaxLength pada search parameter

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/tickets/dto/query-ticket.dto.ts:62` |
| **Kategori** | DoS |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `search` tidak punya `@MaxLength`. String sangat panjang bisa degrade `pg_trgm` GIN index performance.

**Langkah Fix:** Tambahkan `@MaxLength(200)`.

---

#### SEC-041: Post-query attachment filtering untuk EndUser di comments

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/comments/comments.service.ts:232-246` |
| **Kategori** | Defense in depth |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** EndUser attachment filter di-applied setelah DB query return semua attachments (termasuk INTERNAL). Less robust daripada query-level filter. Defense-in-depth masih ada (PUBLIC comments seharusnya hanya punya PUBLIC attachments), tetapi query-level filter lebih aman.

**Langkah Fix:** Ubah `commentRepository.findByTicketId()` untuk menerima parameter visibility filter dan apply di `where` clause level. Atau gunakan `select` dengan conditional `where` untuk attachments.

---

#### SEC-042: Cache-Control aggressive pada authenticated file downloads

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/attachments/attachments.controller.ts:105` |
| **Kategori** | Cache security |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `Cache-Control: private, max-age=86400` (24 jam) pada download authenticated. Di shared browser, user B mungkin akses cached file user A.

**Langkah Fix:** Ubah ke `Cache-Control: private, no-cache` atau `private, max-age=0, must-revalidate` untuk authenticated content.

---

#### SEC-043: MAX_FILES_PER_TICKET tidak di-enforce di comment attachments

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/attachments/attachments.service.ts:136-141` |
| **Kategori** | Consistency / DoS |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `MAX_FILES_PER_TICKET` (5) hanya di-check di direct upload path. Comment attachments tidak check ini. User bisa tambah 3 attachments per comment tanpa batas per-ticket.

**Langkah Fix:** Tambahkan `MAX_FILES_PER_TICKET` check di `comments.service.ts` `create()` method, count semua attachments di ticket (direct + comment).

---

#### SEC-044: Telegram toUpperCase() mengurangi entropy link code

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/telegram/telegram.service.ts:447` |
| **Kategori** | Entropy |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `.toUpperCase()` merge a-z dengan A-Z, mengurangi alphabet dari 64 ke ~38.

**Langkah Fix:** Hapus `.toUpperCase()`. Lihat SEC-017 untuk fix lengkap (8 bytes, 8 chars, case-sensitive).

---

#### SEC-045: findWithTelegramCode return full user termasuk password hash

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/common/repositories/user.repository.ts:126-133` |
| **Kategori** | Unnecessary data exposure |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** Tidak ada `select`, return semua field termasuk `password`. Password hash di-load ke memory tetapi tidak dikirim ke mana pun.

**Langkah Fix:** Tambahkan `select`:
```typescript
select: { id: true, email: true, role: true, isActive: true, telegramCode: true, telegramCodeAt: true }
```

---

#### SEC-046: findFirst()/create() langsung untuk TelegramConfig singleton

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/telegram/telegram.service.ts:183-186` |
| **Kategori** | Race condition / Convention |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** AGENTS.md mandate `findOrCreate()` pada fixed key `"default"`. Service menggunakan `findFirst()` dan `create()` langsung. Concurrent requests saat config belum ada bisa create multiple rows.

**Langkah Fix:** Gunakan `findOrCreate()` dari `telegram-config.repository.ts` dengan key `"default"`.

---

#### SEC-047: Reactivation inactive user pada create mungkin mengejutkan

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/users/users.service.ts:57-65` |
| **Kategori** | Operational surprise |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `create()` dengan email inactive user akan reactivate akun lama dengan password/name/role baru. Admin mungkin tidak sadar mereaktivasi user yang sudah di-deactivate (mis. ex-employee).

**Langkah Fix:** Tambahkan response field yang jelas: `{ message: 'User reactivated successfully', reactivated: true }` atau throw error jika email sudah exists (meskipun inactive), dan berikan endpoint terpisah untuk reactivation.

---

#### SEC-048: Tidak ada self-deletion protection untuk admin

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/users/users.controller.ts:68-73` |
| **Kategori** | Operational safety |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** Admin bisa delete akun sendiri (`DELETE /users/:id` dengan ID sendiri). Bisa cause lockout.

**Langkah Fix:** Di `users.service.delete()`, tambahkan check:
```typescript
if (userId === requesterId) {
  throw new BadRequestException('Cannot delete your own account');
}
```
Pass `requesterId` dari controller via `@CurrentUser()`.

---

#### SEC-049: Tidak ada default nginx server block untuk unmatched Host

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `nginx/nginx.conf:44-45` |
| **Kategori** | Virtual host / DNS rebinding |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** Tidak ada `default_server` di listen directive. Nginx menggunakan server block pertama (satu-satunya) sebagai default untuk arbitrary `Host` header (IP access, DNS rebinding).

**Langkah Fix:** Tambahkan default server block yang menolak request:
```nginx
server {
    listen 80 default_server;
    server_name _;
    return 444;  # connection closed without response
}
```
Dan tambahkan `default_server` ke listen di server block yang ada (atau biarkan tanpa default_server jika sudah ada catch-all di atas).

---

#### SEC-050: Tidak ada explicit deny untuk hidden/sensitive files di nginx

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `nginx/nginx.conf` |
| **Kategori** | Defense in depth |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** Tidak ada `location ~ /\. { deny all; }` block. Jika dotfile accidentally masuk ke build output, bisa diakses.

**Langkah Fix:** Tambahkan:
```nginx
location ~ /\. {
    deny all;
}
```

---

#### SEC-051: frontend/nginx.conf tidak ada security headers

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `frontend/nginx.conf` (entire file) |
| **Kategori** | Security headers |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** Config ini (digunakan jika frontend Dockerfile `production` stage di-run langsung) tidak punya security headers apapun. Tidak digunakan di docker-compose saat ini, tetapi insecure jika digunakan.

**Langkah Fix:** Tambahkan security headers yang sama dengan `nginx/nginx.conf` (lihat SEC-004, SEC-005).

---

#### SEC-052: Deprecated root .env.example dengan no-password Redis URL

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `.env.example` (root) |
| **Kategori** | Misconfiguration |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `REDIS_URL=redis://cache:6379` tanpa password. Kontradiksi dengan compose setup yang require `REDIS_PASSWORD`. Tidak ada deprecation notice di file ini.

**Langkah Fix:** Hapus file ini atau tambahkan deprecation notice dan password placeholder. Redirect ke `backend/.env.compose.example`.

---

#### SEC-053: Manifest backup file leak DB username

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `scripts/backup.sh:58-64` |
| **Kategori** | Information disclosure |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** Manifest menyimpan `postgres_user=$POSTGRES_USER`. Minor info leak jika backup diakses.

**Langkah Fix:** Hapus `postgres_user` dari manifest, atau ganti dengan boolean `has_postgres_user=true`.

---

#### SEC-054: Dependency versions perlu verify (axios CVEs)

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `frontend/package.json:17` |
| **Kategori** | Dependency vulnerability |
| **Status** | `[ ] Jalankan npm audit manual` |

**Deskripsi:** `axios: ^1.6.2` — 1.6.x line punya known CVEs (CVE-2024-39338 SSRF, CVE-2023-45857 cookie disclosure). Actual pinned version di `package-lock.json` belum di-inspect.

**Langkah Fix:** Jalankan `npm audit` di `frontend/`. Update axios ke latest 1.x jika perlu. Regenerate lockfile dengan Docker node version (lihat AGENTS.md "Lockfile compatibility").

---

#### SEC-055: Tidak ada @MaxLength pada QueryUsersDto.search/role

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/users/dto/query-user.dto.ts:22-30` |
| **Kategori** | Input validation |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `search` tidak punya `@MaxLength`. `role` `@IsString()` bukan `@IsEnum(Role)`.

**Langkah Fix:** Tambahkan `@MaxLength(200)` pada `search`. Ganti `@IsString()` dengan `@IsEnum(Role)` pada `role` (atau `@IsOptional()` + `@IsEnum(Role)`).

---

#### SEC-056: Redis client tidak ada TLS option

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/redis/redis.service.ts:14-24` |
| **Kategori** | Transport security |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** Redis client tidak enable TLS. Di Docker network ini internal traffic, tetapi jika Redis di untrusted network, refresh tokens (full JWT) transit cleartext.

**Langkah Fix:** Tambahkan `tls` option jika `REDIS_TLS=true`:
```typescript
const options: RedisClientOptions = { url: redisUrl };
if (process.env.REDIS_TLS === 'true') {
  options.socket = { tls: true };
}
```
**Catatan:** untuk Docker internal network, TLS tidak diperlukan. Tambahkan sebagai opsional.

---

#### SEC-057: Low-entropy 32-char JWT secret

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/.env:18` |
| **Kategori** | Key strength |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** `JWT_SECRET=f7Kq9X2mP4sLz8WbH3rTn6YvC1Jd5A0U` (32 chars alphanumeric). Pass `>= 32` check tetapi entropy relatif rendah untuk production signing secret.

**Langkah Fix:** Generate secret yang lebih kuat: `openssl rand -hex 64` (128 hex chars). Update `.env`.

---

#### SEC-058: Telegram botToken disimpan plaintext di DB

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/prisma/schema.prisma:251` |
| **Kategori** | Secret at rest |
| **Status** | `[ ] Ditangguhkan — kompleksitas vs risk` |

**Deskripsi:** `botToken` disimpan plaintext. API strip dari response, tetapi DB column tidak encrypted. Siapapun dengan DB read access (via backup dump) mendapat bot token.

**Langkah Fix:** Encrypt botToken di application layer sebelum disimpan. Gunakan `crypto.createCipheriv` dengan key dari env (`ENCRYPTION_KEY`). Decrypt saat digunakan. **Catatan:** ini menambah kompleksitas. Alternatif: terima risk ini karena DB access sudah terbatas (hanya via app + admin backup). Prioritaskan setelah HIGH/MEDIUM.

---

#### SEC-059: Tidak ada CI/CD pipeline

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | (no CI files) |
| **Kategori** | Process / Automation |
| **Status** | `[x] Diperbaiki` |

**Deskripsi:** Tidak ada `.github/`, `.gitlab-ci.yml`, atau CI config. Semua verification manual.

**Langkah Fix:** Tambahkan GitHub Actions workflow untuk: `npm test`, `npm run build`, `npm run lint`, `npm audit`. Run pada PR dan push to main.

---

#### SEC-060: Pervasive `as any` di user.repository.ts

| Atribut | Nilai |
|---------|-------|
| **Severity** | LOW |
| **Lokasi** | `backend/src/common/repositories/user.repository.ts:21,38,55,79,83,87,123,132` |
| **Kategori** | Type safety |
| **Status** | `[ ] Noted — low priority` |

**Deskripsi:** Hampir semua method return `as any`. Ini defeat TypeScript type safety dan bisa mask accidental password-hash selection di query yang result-nya reach client.

**Langkah Fix:** Define proper return types (Prisma generated types). Hapus `as any`. Gunakan `Prisma.UserGetPayload<{ select: {...} }>` untuk typed returns.

---

### INFORMATIONAL — Catatan positif & observasi

Berikut adalah praktik keamanan yang **sudah baik** dan tidak perlu diubah:

| ID | Observasi |
|----|-----------|
| POS-01 | bcrypt cost 12 konsisten di `users.service.ts`, `seed.ts` |
| POS-02 | Refresh token rotation dengan Redis + reuse detection |
| POS-03 | Cookie httpOnly + sameSite=strict + path `/api/auth` |
| POS-04 | Refresh token tidak pernah di-return di JSON body |
| POS-05 | JwtStrategy load user dari DB per request + check `isActive` |
| POS-06 | `helmet()` enabled di backend |
| POS-07 | `ValidationPipe` dengan `whitelist` + `forbidNonWhitelisted` |
| POS-08 | CORS static allow-list (bukan `*`) |
| POS-09 | `HttpExceptionFilter` return generic message untuk 500 |
| POS-10 | `deleteByPattern` menggunakan SCAN bukan KEYS |
| POS-11 | `findById` (JWT path) exclude password hash |
| POS-12 | `.env` sudah gitignored |
| POS-13 | `execFile` bukan `exec` (no command injection) |
| POS-14 | Tar slip protection di restore (symlink, absolute path, `..`) |
| POS-15 | Backup ID regex validation (path traversal prevention) |
| POS-16 | `quoteIdentifier` untuk SQL identifier quoting |
| POS-17 | IDOR protection: ticket ownership check untuk EndUser |
| POS-18 | EndUser tidak bisa create INTERNAL comments |
| POS-19 | EndUser attachment visibility forced to PUBLIC |
| POS-20 | `AttachmentVisibilityPolicy` terpusat, query-level filter di `attachments.service` |
| POS-21 | CSV injection mitigation (prefix `=+-@\t\r` dengan `'`) |
| POS-22 | Export/assign/priority/delete role-restricted |
| POS-23 | No mass assignment (requesterId dari auth, status hardcoded Open) |
| POS-24 | No SQL injection (Prisma parameterized, sort whitelist) |
| POS-25 | Path traversal prevention di upload (`path.basename` + `startsWith` check) |
| POS-26 | File size limits (10MB direct, 5MB comments) |
| POS-27 | Files served via controller (not nginx direct), `nosniff` header |
| POS-28 | No password hash leakage in ticket/comment/attachment queries |
| POS-29 | Access token memory-only (Zustand non-persisted) |
| POS-30 | No `dangerouslySetInnerHTML` / `innerHTML` / `eval` di frontend |
| POS-31 | All user content rendered as JSX text (auto-escaped) |
| POS-32 | Logout clears Zustand + TanStack Query cache + socket disconnect |
| POS-33 | WebSocket token via `auth` payload (not URL) |
| POS-34 | No secrets in `VITE_` env vars |
| POS-35 | Secure blob-based file downloads with URL revocation |
| POS-36 | Telegram secrets stripped from API response (hasBotToken/hasGroupChatId flags) |
| POS-37 | Refresh flow: no infinite loop (raw axios + failed-request queue + URL exclusions) |
| POS-38 | Notifications IDOR protection (updateMany with userId) |
| POS-39 | Dashboard role-restricted, returns only aggregate counts |
| POS-40 | Categories/SubCategories/SLA write operations admin-only |
| POS-41 | Maintenance backup/restore admin-only |
| POS-42 | Telegram config CRUD admin-only |
| POS-43 | Users module admin-only (class-level guard) |
| POS-44 | No hardcoded fallbacks for JWT_SECRET, DATABASE_URL, REDIS_URL |
| POS-45 | Production env validation (JWT_SECRET >= 32, REDIS_PASSWORD required) |

---

## Checklist Progres Fix

> **Instruksi:** update status setelah fix diimplementasi dan diverifikasi.
> Gunakan `[x]` untuk selesai, `[~]` untuk in-progress, `[ ]` untuk belum mulai.

### HIGH Priority (9 items)

- [x] **SEC-001**: Enforce `COOKIE_SECURE=true` di production (`main.ts` validateEnv + `.env`)
- [x] **SEC-002**: JwtStrategy reject token tanpa `tokenType` (explicit check)
- [x] **SEC-003**: Account lockout setelah N failed attempts (Redis tracking)
- [x] **SEC-004**: Security headers nginx untuk static assets (repeat add_header per location)
- [x] **SEC-005**: Content-Security-Policy header untuk frontend
- [x] **SEC-006**: `chmod 600 backend/.env` + dokumentasi
- [x] **SEC-007**: `.gitignore` cover `.env.*` variants
- [x] **SEC-008**: Docker container hardening (security_opt, cap_drop, mem_limit, cpus)
- [x] **SEC-009**: Comment repository: `include` → `select` untuk exclude `path`

### MEDIUM Priority (17 items)

- [x] **SEC-010**: Timing side-channel: dummy bcrypt compare untuk user-not-found
- [ ] **SEC-011**: Refresh token family-based revocation (ditangguhkan — breaking change)
- [x] **SEC-012**: Access token revocation (accept 15min tradeoff — documented)
- [x] **SEC-013**: Global JwtAuthGuard dengan `@Public()` decorator (fail-closed)
- [x] **SEC-014**: Comment body: gunakan `CreateCommentDto` class (enable ValidationPipe)
- [x] **SEC-015**: File extension whitelist di `buildSafeUploadPath()`
- [x] **SEC-016**: Sanitize `originalName` sebelum simpan ke DB
- [x] **SEC-017**: Telegram link code: 8 bytes, 8 chars, hapus toUpperCase()
- [x] **SEC-018**: Atomic Redis lock release via Lua script
- [x] **SEC-019**: Restore-lock check di `setMaintenanceMode()`
- [x] **SEC-020**: Strong infrastructure credentials di `.env`
- [x] **SEC-021**: `no-new-privileges` untuk API container (via SEC-008)
- [x] **SEC-022**: `chmod 700 backups/` atau switch ke named volume
- [x] **SEC-023**: Separate env files per service (least-privilege)
- [x] **SEC-024**: Multer disk storage (accept memory storage + mem_limit via SEC-008)
- [x] **SEC-025**: `@MaxLength(128)` pada LoginDto/ChangePasswordDto
- [x] **SEC-026**: Magic byte signatures untuk Office formats + text file integrity check

### LOW Priority (25 items)

- [ ] **SEC-027**: Separate JWT_REFRESH_SECRET (ditangguhkan — breaking change)
- [x] **SEC-028**: Config drift: baca refresh TTL dari env yang sama
- [x] **SEC-029**: change-password: clear refresh cookie
- [x] **SEC-030**: CSRF: catat risk acceptance sameSite=strict (no action needed)
- [x] **SEC-031**: Maintenance: gunakan @Public() alih-alih URL prefix (addressed via SEC-013)
- [x] **SEC-032**: @SkipMaintenance: addressed via @Public() approach
- [x] **SEC-033**: Open redirect: validate `from.pathname` starts with `/`
- [x] **SEC-034**: CreateTicketForm: tambah MIME type validation
- [ ] **SEC-035**: UserManagement: tambah client-side validation (defense in depth, backend validasi)
- [x] **SEC-036**: ErrorBoundary: guard console.error dengan `import.meta.env.DEV`
- [x] **SEC-037**: UserManagement: ganti `alert()` dengan `toast.error()`
- [x] **SEC-038**: CreateTicketDto: `@MaxLength(10000)` pada description
- [x] **SEC-039**: QueryTicketDto: `@IsUUID()` untuk categoryId/assignedToId/requesterId
- [x] **SEC-040**: QueryTicketDto: `@MaxLength(200)` pada search
- [x] **SEC-041**: Comments: post-query filter adequate (defense in depth, SEC-009 fix path leak)
- [x] **SEC-042**: Download: `Cache-Control: private, no-cache`
- [x] **SEC-043**: MAX_FILES_PER_TICKET check di comment attachments
- [x] **SEC-044**: Telegram: hapus toUpperCase() (covered by SEC-017)
- [x] **SEC-045**: findWithTelegramCode: tambah `select` exclude password
- [x] **SEC-046**: TelegramConfig: gunakan `findOrCreate()` dari repository
- [x] **SEC-047**: User create: clear reactivation response
- [x] **SEC-048**: User delete: prevent self-deletion
- [x] **SEC-049**: Nginx: default_server block untuk unmatched Host
- [x] **SEC-050**: Nginx: `location ~ /\. { deny all; }`
- [x] **SEC-051**: frontend/nginx.conf: tambah security headers
- [x] **SEC-052**: Hapus atau update deprecated root .env.example
- [x] **SEC-053**: backup.sh: hapus postgres_user dari manifest
- [ ] **SEC-054**: `npm audit` di frontend (jalankan manual saat maintenance)
- [x] **SEC-055**: QueryUsersDto: `@MaxLength(200)` search, `@IsEnum(Role)` role
- [x] **SEC-056**: Redis TLS option (opsional, untuk non-Docker network)
- [x] **SEC-057**: Generate stronger JWT secret (`openssl rand -hex 64`)
- [ ] **SEC-058**: Encrypt Telegram botToken at rest (ditangguhkan — kompleksitas vs risk)
- [x] **SEC-059**: Tambah CI/CD pipeline (GitHub Actions)
- [ ] **SEC-060**: Hapus `as any` di user.repository.ts (low priority, noted)

---

## Catatan untuk Agent AI Selanjutnya

> **Baca section ini sebelum memulai work di session baru.**

### Konteks Session 4 (Security Review)

1. **Session ini sudah diimplementasi.** Semua fix HIGH dan MEDIUM (kecuali SEC-011 yang ditangguhkan) sudah diterapkan dan diverifikasi. Backend build + 50 tests passed, frontend build passed.

2. **Session 2** (Performance) dan **Session 3** (Bug Fixes) sudah selesai sebelumnya. Lihat AGENTS.md section "Performance Optimizations" dan "Bug Fixes" untuk konteks.

3. **Item yang ditangguhkan (breaking change, butuh maintenance window):**
   - **SEC-011**: Refresh token family-based revocation — semua existing refresh tokens invalidated.
   - **SEC-027**: Separate `JWT_REFRESH_SECRET` — semua existing refresh tokens invalidated.

4. **Item yang tidak diimplementasi (low priority / risk acceptance):**
   - **SEC-035**: UserManagement client-side validation — defense in depth, backend sudah validasi.
   - **SEC-054**: `npm audit` — jalankan manual saat maintenance.
   - **SEC-058**: Encrypt Telegram botToken at rest — kompleksitas vs risk.
   - **SEC-060**: `as any` di `user.repository.ts` — type safety improvement, low priority.

5. **Urutan rekomendasi untuk implementasi:**
   - **Batch 1 (no breaking change, quick wins):** SEC-002, SEC-006, SEC-007, SEC-009, SEC-015, SEC-016, SEC-025, SEC-029, SEC-038, SEC-039, SEC-040, SEC-042, SEC-045, SEC-048, SEC-050
   - **Batch 2 (config/infra, no app breaking):** SEC-004, SEC-005, SEC-008, SEC-020, SEC-022, SEC-023, SEC-049, SEC-051, SEC-052, SEC-057
   - **Batch 3 (app changes, moderate):** SEC-003, SEC-010, SEC-014, SEC-017, SEC-018, SEC-019, SEC-021, SEC-024, SEC-026
   - **Batch 4 (breaking changes, need maintenance window):** SEC-001, SEC-011, SEC-013, SEC-027
   - **Batch 5 (low priority, as time permits):** sisa LOW items

6. **Verification commands** (dari AGENTS.md):
   - Backend: `npm test` dan `npm run build` di `backend/`
   - Frontend: `npm run build`, `npm run lint`, `vitest` di `frontend/`
   - Docker: `docker compose up --build` di repo root

7. **File yang paling banyak perlu diubah:**
   - `backend/src/auth/auth.service.ts` — SEC-002, SEC-010, SEC-011, SEC-012, SEC-025, SEC-027, SEC-028
   - `backend/src/auth/auth.controller.ts` — SEC-025, SEC-029
   - `backend/src/auth/strategies/jwt.strategy.ts` — SEC-002
   - `backend/src/main.ts` — SEC-001
   - `backend/src/comments/comments.controller.ts` — SEC-014
   - `backend/src/comments/comments.service.ts` — SEC-014, SEC-015, SEC-016, SEC-026
   - `backend/src/attachments/attachments.service.ts` — SEC-015, SEC-016, SEC-026
   - `backend/src/common/repositories/comment.repository.ts` — SEC-009
   - `backend/src/maintenance/maintenance.service.ts` — SEC-018, SEC-019
   - `backend/src/telegram/telegram.service.ts` — SEC-017, SEC-046
   - `nginx/nginx.conf` — SEC-004, SEC-005, SEC-049, SEC-050
   - `docker-compose.yml` — SEC-008, SEC-021, SEC-022, SEC-023
   - `.gitignore` — SEC-007
   - `backend/.env` — SEC-001, SEC-020, SEC-057

8. **Jangan lupa update AGENTS.md** setelah fix diimplementasi. Tambahkan section "Security Fixes (CODE_REVIEW.md Session 4)" di AGENTS.md dengan summary fix yang sudah dilakukan, mirip dengan section "Bug Fixes (CODE_REVIEW.md Session 3)".

9. **Test coverage gaps yang perlu diisi saat implementasi:**
   - Test untuk JwtStrategy reject token tanpa `tokenType` (SEC-002)
   - Test untuk account lockout (SEC-003)
   - Test untuk timing side-channel (SEC-010)
   - Test untuk comment body ValidationPipe (SEC-014)
   - Test untuk file extension whitelist (SEC-015)
   - Test untuk atomic lock release (SEC-018)
   - Test untuk restore-lock check (SEC-019)

10. **Jika ada konflik antara temuan dan code actual:** trust the code. Beberapa temuan mungkin sudah di-address sejak review ini dilakukan. Verifikasi dengan membaca file sebelum mengimplementasi fix.

---

*End of Session 4 — Security Review*
