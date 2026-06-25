# Security Code Review

Tanggal review: 2026-06-25

Reviewer: Senior fullstack security/code review

Scope utama: keamanan aplikasi IT Support Ticketing, mencakup backend NestJS, frontend React, auth/RBAC, upload/download file, backup/restore, Telegram integration, Docker/nginx, seed/env, dan dependency audit.

Status dokumen: SEC-001–SEC-016, SEC-019, SEC-020 sudah difix. Sisa: multer high (butuh NestJS 11) dan Prisma migration attachment_visibility perlu deploy.

## Ringkasan Eksekutif

Risiko tertinggi ada pada area berikut:

- Access token WebSocket bisa bocor lewat query string.
- Refresh session lama tidak dicabut setelah password berubah/reset.
- Restore backup uploads memakai ekstraksi `tar` yang belum aman terhadap path traversal/symlink/hardlink.
- Endpoint `/users` membuka direktori user ke `ITSupport`, bertentangan dengan policy Admin-only dan dipakai frontend untuk assignment.
- Backend memiliki production dependency vulnerabilities, termasuk `multer` dan `tar` high severity.
- Konfigurasi deployment default masih HTTP-only dan belum cukup aman jika dipakai di luar local/dev.

Prioritas pengerjaan:

| Prioritas | Fokus | Target |
|---|---|---|
| P0 | Token/session, restore archive safety, dependency high vulnerabilities | Tutup risiko compromise langsung |
| P1 | Authorization/data exposure, attachment visibility, upload/download hardening | Tutup kebocoran data tenant/user/internal |
| P2 | Telegram, pagination/DoS, backup/Redis/deployment hardening | Kurangi abuse dan risiko operasional |
| P3 | UX-security hygiene dan cleanup tipe/frontend | Kurangi regresi dan future misuse |

## Progress Checklist

Gunakan checklist ini sebagai sumber status lintas session. Jangan centang sebelum fix terimplementasi dan verifikasi relevan hijau.

| Status | ID | Prioritas | Area | Ringkasan | Verifikasi minimum |
|---|---|---|---|---|---|
| [x] | SEC-001 | P0 | WebSocket auth | Hapus token dari query string | Backend test/manual Socket.IO auth |
| [x] | SEC-002 | P0 | Refresh session | Revoke semua refresh token user saat password berubah/reset/deactivate | Backend unit test auth/users |
| [x] | SEC-003 | P0 | Restore backup | Safe tar validation/extraction | Backend unit/integration test restore helper |
| [x] | SEC-004 | P0 | Dependencies | Upgrade/fix backend audit high vulnerabilities | `npm audit --omit=dev`, `npm test`, `npm run build` di backend |
| [x] | SEC-005 | P1 | Users/RBAC | Batasi `/users` ke Admin dan buat endpoint assignable-users minimal | Backend auth tests, frontend build |
| [x] | SEC-006 | P1 | Ticket detail exposure | Omit/gate histories untuk EndUser | Backend service test, frontend build |
| [x] | SEC-007 | P1 | Attachment visibility | Tambah visibility internal/public untuk standalone attachment | Migration, backend tests, frontend build |
| [x] | SEC-008 | P1 | Upload/download | Magic-byte validation, safe headers, stream error handling | Upload/download tests |
| [x] | SEC-009 | P2 | Pagination/DoS | Enforce bounded DTO pagination semua endpoint | Backend tests/build |
| [x] | SEC-010 | P2 | Telegram auth/secrets | RBAC policy, crypto link code, rate limit, escape HTML, encrypt token | Backend tests/manual Telegram check |
| [x] | SEC-011 | P2 | Backup protection | Backup encryption/permissions/maintenance enforcement/lock | Manual backup/restore smoke test |
| [x] | SEC-012 | P2 | Redis/deployment | Redis auth/persistence and TLS/security headers if production | Compose smoke test |
| [x] | SEC-013 | P3 | Frontend devtools/cache | Devtools dev-only, cache clear after restore/logout-like flows | Frontend build |
| [x] | SEC-014 | P3 | Frontend refresh/user state | Refresh interceptor updates `user` as well as token | Frontend build/manual role change |
| [x] | SEC-015 | P3 | Password change access | Allow EndUser password change if no external IdP | Backend/frontend tests/build |
| [x] | SEC-016 | P3 | Seed/env hygiene | Refuse weak placeholders and unsafe seed outside local | Seed/manual startup check |

## Temuan Dan Langkah Fix Detail

### SEC-001 - WebSocket access token bisa bocor lewat query string

Severity: High

Referensi:

- `backend/src/notifications/notifications.gateway.ts:42-45`

Root cause:

- Gateway menerima token dari `client.handshake.query.token` selain `client.handshake.auth.token`.
- Query string umum tercatat di access log nginx, proxy, APM, browser tooling, dan error report.

Impact:

- Access token bisa terekspos ke pihak yang punya akses log.
- Token valid dapat dipakai untuk API sampai expiry.

Langkah fix:

1. Ubah `NotificationsGateway.handleConnection()` agar hanya membaca `client.handshake.auth?.token`.
2. Tolak koneksi jika token tidak string atau kosong setelah trim.
3. Jangan log handshake/query/auth payload.
4. Jika frontend memakai Socket.IO, pastikan koneksi menggunakan pola `io('/notifications', { auth: { token } })`, bukan `?token=`.
5. Tambahkan test atau manual smoke test untuk 2 skenario: token via `auth` sukses, token via `query` gagal.
6. Review nginx/access logs untuk memastikan URL socket tidak lagi membawa token.

Contoh perubahan backend minimal:

```ts
const token = client.handshake.auth?.token;
if (typeof token !== 'string' || !token.trim()) {
  client.disconnect();
  return;
}
```

Verifikasi:

- Jalankan `npm test` di `backend` jika test ditambahkan.
- Jalankan `npm run build` di `backend`.
- Manual: koneksi socket dengan `{ auth: { token } }` menerima notification.
- Manual: koneksi socket dengan `?token=...` langsung disconnect.

### SEC-002 - Refresh session lama tidak dicabut setelah password berubah/reset/deactivate

Severity: High

Referensi:

- `backend/src/auth/auth.service.ts:104`
- `backend/src/users/users.service.ts:83-88`
- `backend/src/users/users.service.ts:91-103`

Root cause:

- Password update hanya mengganti hash.
- Refresh token tersimpan di Redis sebagai `refresh:{userId}:{jti}` dan tetap valid sampai expiry.
- Admin reset password dan deactivation tidak menghapus token lama.

Impact:

- Jika refresh token dicuri, attacker tetap dapat refresh access token setelah user mengganti password.
- Akun inactive/deactivated masih punya token tersisa di Redis, meskipun `refresh()` akan menolak user inactive setelah lookup DB; token tetap sebaiknya dicabut untuk hygiene dan incident response.

Langkah fix:

1. Tambahkan method di `RedisService` untuk delete by pattern dengan `SCAN`, bukan `KEYS`, misalnya `deleteByPattern(pattern: string)`.
2. Tambahkan method `AuthService.revokeAllRefreshTokens(userId: string)` yang memanggil `deleteByPattern('refresh:${userId}:*')`.
3. Di `AuthService.changePassword()`, setelah password berhasil diupdate, revoke semua refresh token user.
4. Untuk menjaga session saat ini juga dicabut, frontend harus logout setelah password change sukses dan minta user login ulang.
5. Untuk admin reset password di `UsersService.update()`, jika `updateUserDto.password` ada, revoke semua refresh token user.
6. Untuk `UsersService.delete()` atau deactivation, revoke semua refresh token user setelah user dinonaktifkan/dihapus.
7. Hindari circular dependency `UsersService -> AuthService -> UsersService`. Opsi paling bersih: buat `SessionService` kecil di auth/redis layer yang hanya mengelola refresh token keys, lalu inject ke `AuthService` dan `UsersService`.
8. Alternatif arsitektur: tambahkan field `passwordChangedAt` atau `tokenVersion` di model `User`, lalu validasi di refresh/access token. Ini butuh migration dan perubahan token payload.

Contoh helper Redis:

```ts
async deleteByPattern(pattern: string): Promise<number> {
  let cursor = '0';
  let deleted = 0;
  do {
    const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      deleted += await this.client.del(...keys);
    }
  } while (cursor !== '0');
  return deleted;
}
```

Verifikasi:

- Unit test: login dua session, change password, refresh token lama harus 401.
- Unit test: admin reset password, refresh token lama user harus 401.
- Manual: setelah change password, frontend logout dan login ulang wajib.
- Jalankan `npm test` dan `npm run build` di `backend`.

### SEC-003 - Restore backup uploads rentan path traversal/symlink/hardlink overwrite

Severity: High

Referensi:

- `backend/src/maintenance/maintenance.service.ts:179-180`
- `backend/src/maintenance/maintenance.service.ts:280-292`

Root cause:

- Restore hanya menjalankan `gzip -t` terhadap `uploads.tar.gz`.
- Setelah itu `tar -xzf uploads.tar.gz -C uploadDir` langsung dieksekusi.
- Archive dapat berisi entry absolute path, `../`, symlink, atau hardlink yang mengarah keluar `uploadDir`.

Impact:

- Backup malicious atau corrupt dapat overwrite file aplikasi sebagai user API.
- Bisa menjadi path ke privilege escalation atau aplikasi rusak setelah restore.

Langkah fix:

1. Tambahkan validasi daftar entry sebelum extraction dengan `tar -tzf`.
2. Reject entry jika path absolute, kosong, mengandung `..`, mengandung NUL, atau resolve path keluar `uploadDir`.
3. Reject symlink/hardlink. Dengan GNU tar, gunakan listing verbose atau format yang menampilkan typeflag. Lebih aman pakai library archive yang expose metadata type entry, tetapi pastikan library tidak vulnerable.
4. Extract ke temporary directory di parent yang sama, bukan langsung ke `uploadDir`.
5. Setelah semua entry valid dan extraction selesai, swap directory secara atomik sebisa mungkin: rename `uploadDir` ke backup temp, rename extracted temp ke `uploadDir`, lalu cleanup old dir.
6. Jalankan tar dengan flags hardening jika tetap memakai system tar: `--no-same-owner`, `--no-same-permissions`, dan jangan preserve owner/mode dari archive.
7. Pastikan cleanup temp directory terjadi di `finally`.
8. Tambahkan test archive malicious: `../evil`, `/tmp/evil`, symlink keluar, hardlink keluar.

Contoh validasi path entry:

```ts
private assertSafeTarPath(entryName: string): void {
  if (!entryName || entryName.includes('\0') || path.isAbsolute(entryName)) {
    throw new BadRequestException('Uploads backup contains unsafe path');
  }
  const normalized = path.posix.normalize(entryName);
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new BadRequestException('Uploads backup contains path traversal');
  }
}
```

Catatan:

- Validasi nama saja belum cukup untuk symlink/hardlink; metadata entry tetap harus dicek.
- Jangan gunakan `tar` npm lama tanpa memastikan advisory `node-tar` sudah fixed.

Verifikasi:

- Test restore dengan archive normal sukses.
- Test restore dengan `../evil` gagal sebelum extraction.
- Test restore dengan symlink/hardlink gagal.
- Jalankan `npm run build` di `backend`.

### SEC-004 - Backend production dependency vulnerabilities

Severity: High

Referensi:

- `backend/package.json:19-44`
- Hasil command: `npm audit --omit=dev` di `backend` menghasilkan 16 vulnerabilities, 4 high.

Root cause:

- Dependency NestJS 10.x dan transitive dependency membawa advisory terbaru.
- `multer` langsung di dependency masih `^1.4.5-lts.1`.
- `tar` transitive dari dependency lain vulnerable.

Impact:

- Upload endpoint dapat kena DoS dari advisory `multer`.
- Tar vulnerability relevan karena aplikasi juga punya fitur backup/restore archive.
- Supply-chain risk dan compliance failure.

Langkah fix:

1. Jalankan `npm audit --omit=dev` di `backend` dan simpan hasil terkini sebelum upgrade.
2. Cek release notes NestJS dan compatibility path. `npm audit fix --force` mungkin mendorong Nest 11 dan breaking change.
3. Prioritaskan upgrade patch/minor yang tidak breaking jika tersedia.
4. Upgrade `multer` ke versi fixed atau rely pada versi fixed dari `@nestjs/platform-express`. Perhatikan API Multer v2 jika direct dependency masih diperlukan.
5. Upgrade `uuid` ke versi fixed dan sesuaikan import jika major berubah. Alternatif pakai `crypto.randomUUID()` untuk UUID server-side.
6. Investigasi dependency yang membawa `tar` lewat `npm ls tar`. Upgrade package pemiliknya atau override dependency jika aman.
7. Setelah upgrade, hapus/reinstall lockfile hanya jika diperlukan dan review diff `package-lock.json`.
8. Jalankan test upload, auth, WebSocket, Telegram polling, backup/restore minimal.

Command yang disarankan:

```bash
npm audit --omit=dev
npm ls multer tar uuid @nestjs/core @nestjs/platform-express
npm outdated
npm test
npm run build
```

Verifikasi:

- `npm audit --omit=dev` tidak menyisakan high vulnerability.
- `npm test` backend hijau.
- `npm run build` backend hijau.
- Manual upload/download file tetap berfungsi.

### SEC-005 - `/users` membuka direktori user ke `ITSupport`

Severity: High

Referensi:

- `backend/src/users/users.controller.ts:25-26`
- `backend/src/common/repositories/user.repository.ts:75-79`
- `frontend/src/hooks/use-users.ts:5-13`
- `frontend/src/components/tickets/TicketList.tsx:33`, `:201-203`
- `frontend/src/components/tickets/TicketDetail.tsx:69`, `:51-53`

Root cause:

- `GET /users` mengizinkan `ITSupport` dan `Admin`.
- Frontend assignment memanggil `/users?includeInactive=true`, lalu filter active support/admin di client.
- Policy `AGENTS.md` menyatakan Users Admin-only.

Impact:

- `ITSupport` dapat enumerate semua user, email, role, active/inactive state.
- Inactive users dan EndUser records masuk network/cache frontend walau hanya perlu daftar assignee.

Langkah fix:

1. Ubah `UsersController.findAll()` agar `@Roles(Role.Admin)` saja.
2. Tambahkan endpoint baru untuk assignment, misalnya `GET /users/assignable` atau `GET /tickets/assignable-users`.
3. Endpoint baru boleh untuk `ITSupport` dan `Admin`.
4. Response endpoint assignable harus minimal: `id`, `name`, mungkin `email` jika memang perlu ditampilkan, `role`; hanya `isActive=true`; role hanya `ITSupport` dan `Admin`.
5. Jangan expose `includeInactive` pada endpoint assignable.
6. Update `frontend/src/hooks/use-users.ts` atau buat hook baru `useAssignableUsers()`.
7. Ubah `TicketList` dan `TicketDetail` agar memakai hook assignable, bukan full `/users`.
8. Admin user management tetap memakai `/users?includeInactive=true`.
9. Tambahkan test RBAC: `ITSupport GET /users` harus 403, `ITSupport GET /users/assignable` harus 200 minimal data.

Verifikasi:

- Backend unit/e2e auth test untuk endpoint user.
- Frontend build hijau.
- Manual: support masih bisa assign ticket, tapi tidak bisa buka full user admin endpoint.

### SEC-006 - EndUser menerima audit trail/internal workflow details

Severity: Medium

Referensi:

- `backend/src/tickets/tickets.service.ts:270-275`
- `frontend/src/components/tickets/TicketDetail.tsx:222-270`

Root cause:

- `findById()` selalu include `histories`, termasuk untuk `EndUser`.
- Frontend menampilkan audit trail jika field ada.

Impact:

- EndUser dapat melihat assignment history, priority/status changes, staff identity, dan workflow internal.
- Ini berpotensi melanggar policy internal comment/workflow separation.

Langkah fix:

1. Di `TicketsService.findById()`, hanya include `histories` ketika `userRole !== 'EndUser'`.
2. Karena Prisma include tidak menerima `false` dalam bentuk conditional yang mudah, buat object include secara eksplisit sebelum query.
3. Alternatif minimal: tetap include, lalu `delete ticket.histories` sebelum return untuk EndUser. Lebih baik tidak query data yang tidak perlu.
4. Di frontend, gate Audit Trail dengan `user.role === 'ITSupport' || user.role === 'Admin'` sebagai defense-in-depth.
5. Update type frontend jika `histories` menjadi optional/absent.
6. Tambah test: EndUser detail own ticket tidak punya `histories`; ITSupport/Admin punya.

Verifikasi:

- Backend test service/controller.
- Frontend build.
- Manual login EndUser lihat ticket: audit trail tidak muncul.

### SEC-007 - Standalone attachment tidak punya visibility internal/public

Severity: Medium

Referensi:

- `backend/src/tickets/tickets.service.ts:261-264`
- `backend/src/attachments/attachments.service.ts:94-102`, `:134-137`, `:154-156`
- `backend/prisma/schema.prisma:127-145`

Root cause:

- Visibility attachment hanya ditentukan dari comment type jika attachment terhubung ke comment.
- Attachment langsung di ticket (`commentId=null`) dianggap visible untuk EndUser.
- UI support/admin dapat upload standalone attachment tanpa pilihan internal/public.

Impact:

- Staff dapat tidak sengaja upload file internal langsung ke ticket dan requester EndUser dapat melihat/download.

Langkah fix opsi A, disarankan:

1. Tambahkan enum atau boolean di Prisma model `Attachment`, misalnya `visibility AttachmentVisibility @default(PUBLIC)` dengan enum `PUBLIC`, `INTERNAL`.
2. Buat migration.
3. Backfill existing data: attachment dengan internal comment menjadi `INTERNAL`; lainnya `PUBLIC`.
4. Update `AttachmentsService.upload()` menerima `visibility` dari DTO/form-data.
5. Untuk EndUser upload, force `PUBLIC` dan ignore input visibility.
6. Untuk ITSupport/Admin upload, default `INTERNAL` atau tampilkan pilihan UI yang jelas. Pilih default berdasarkan policy product.
7. Update query filter EndUser: hanya attachment `visibility=PUBLIC` dan comment bukan internal.
8. Update `CommentsService.create()` agar attachment dari comment internal otomatis `INTERNAL`, comment public otomatis `PUBLIC`.
9. Update frontend `AttachmentList` untuk staff menampilkan selector public/internal dan badge visibility.
10. Tambah tests untuk list/download: EndUser tidak bisa lihat/download internal standalone attachment.

Langkah fix opsi B, minimal tanpa migration:

1. Larang ITSupport/Admin upload standalone attachment langsung ke ticket jika butuh internal file.
2. Ubah UI copy agar file internal wajib lewat internal comment.
3. Tetap ada risiko ambiguity karena data model belum mengekspresikan visibility.

Verifikasi:

- Migration berjalan.
- Backend tests untuk list/download visibility.
- Frontend build.
- Manual upload staff internal dan requester tidak melihat file.

### SEC-008 - Upload MIME validation dan download header/stream belum aman

Severity: Medium

Referensi:

- `backend/src/attachments/attachments.controller.ts:44-51`
- `backend/src/attachments/attachments.controller.ts:82-96`
- `backend/src/attachments/attachments.service.ts:79-90`
- `backend/src/comments/comments.controller.ts:51-58`
- `backend/src/comments/comments.service.ts:90-101`

Root cause:

- File type allowlist hanya memakai `file.mimetype` dari client.
- `Content-Disposition` dibuat dengan interpolasi `attachment.originalName` mentah.
- `fs.createReadStream()` tidak punya error handler; missing file dapat emit error setelah headers mulai dikirim.

Impact:

- User dapat upload arbitrary content dengan MIME palsu.
- Filename berisi quote/control char bisa merusak header response.
- Missing/inaccessible file berpotensi crash/hang response atau DoS kecil.

Langkah fix:

1. Tambahkan library file type detection yang aman dan fixed version, atau gunakan magic bytes parser sederhana untuk tipe yang diizinkan.
2. Validasi extension dari detected type, bukan original extension semata.
3. Simpan file dengan extension hasil detection atau safe extension map.
4. Untuk format berisiko seperti SVG/HTML, jangan masukkan allowlist jika tidak perlu.
5. Set `Content-Type` berdasarkan MIME yang terdeteksi/disimpan server-side.
6. Gunakan package `content-disposition` atau `res.attachment(safeName)` agar filename di-escape benar.
7. Buat fallback filename ASCII aman jika originalName mengandung control char, slash, backslash, quote, atau terlalu panjang.
8. Cek file existence/access sebelum set header, misalnya `await fs.promises.stat(path)`.
9. Tambahkan `fileStream.on('error', ...)` dan destroy response dengan aman jika stream gagal.
10. Pertimbangkan AV scanning jika file upload digunakan di lingkungan production dengan dokumen user.

Verifikasi:

- Test upload MIME palsu ditolak.
- Test download filename berisi quote/newline aman.
- Test missing file return 404/500 terkontrol, tidak crash.
- Backend build/test.

### SEC-009 - Pagination bisa dibypass/diabuse

Severity: Medium

Referensi:

- `backend/src/tickets/dto/query-ticket.dto.ts:20-24`
- `backend/src/tickets/tickets.service.ts:139-140`, `:168`
- `backend/src/users/users.controller.ts:35-36`
- `backend/src/notifications/notifications.controller.ts:29-30`

Root cause:

- Ticket DTO membolehkan `limit=0`, lalu service memakai `take: undefined` sehingga query unbounded.
- Users/notifications parse query manual tanpa DTO bounds dan tanpa handling `NaN`.

Impact:

- Authenticated user dapat memicu query besar dan beban DB/API.
- Nilai invalid dapat memicu Prisma error atau response tidak konsisten.

Langkah fix:

1. Buat DTO pagination reusable, misalnya `PaginationQueryDto` dengan `@Min(1)` dan `@Max(100)`.
2. Ubah `QueryTicketDto.limit` dari `@Min(0)` ke `@Min(1)` dan tambahkan `@Max(100)`.
3. Jika fitur show all memang dibutuhkan, batasi hanya Admin dan gunakan endpoint export/streaming, bukan `limit=0`.
4. Ubah users dan notifications controller agar memakai DTO dengan `ValidationPipe` transform, bukan `parseInt` manual.
5. Normalisasi default di service setelah DTO valid: `page=1`, `limit=10/20`.
6. Tambahkan test invalid: `limit=0`, `limit=10000`, `page=abc` return 400.

Verifikasi:

- Backend tests DTO/controller.
- `npm run build` backend.
- Manual request invalid pagination return 400.

### SEC-010 - Telegram hardening: RBAC, weak link code, HTML injection, secret storage

Severity: Medium

Referensi:

- `backend/src/telegram/telegram.controller.ts:23-37`
- `backend/src/telegram/telegram.service.ts:161-167`, `:227-238`, `:358-365`, `:409-416`
- `backend/prisma/schema.prisma:228-231`

Root cause:

- `link`, `unlink`, `status` hanya butuh JWT, sementara UI hanya Admin.
- Link code 6 char dari `Math.random()`.
- Template variable user-controlled dikirim dengan `parse_mode: 'HTML'` tanpa escaping.
- Bot token disimpan plaintext di DB dan ikut backup.

Impact:

- Policy mismatch: non-admin bisa link/unlink Telegram via API.
- Link code lebih mudah ditebak/prediksi dan tidak ada attempt throttling.
- Ticket subject/field dapat mengubah format/link Telegram.
- DB/backup leak memberi kontrol penuh bot Telegram.

Langkah fix RBAC/policy:

1. Putuskan policy: Telegram link untuk semua role atau Admin-only.
2. Jika Admin-only, tambahkan `@UseGuards(RolesGuard)` dan `@Roles(Role.Admin)` ke `link`, `unlink`, `status`.
3. Jika semua role boleh link, update `AGENTS.md` dan UI agar tidak misleading, lalu tetap batasi config/test/check ke Admin.

Langkah fix link code:

1. Ganti `Math.random()` dengan `crypto.randomBytes()` atau `crypto.randomInt()`.
2. Naikkan entropy, misalnya 10-12 char base32/base36.
3. Simpan hash code, bukan plaintext, jika ingin defense-in-depth.
4. Tambahkan `telegramCodeAttempts` atau Redis rate limit per chat/IP/code.
5. Setelah sukses link, single-use seperti sekarang tetap dipertahankan.

Langkah fix HTML injection:

1. Tambahkan helper `escapeTelegramHtml(value)` untuk `&`, `<`, `>`, `"` jika parse HTML tetap dipakai.
2. Escape semua variable sebelum `renderMessage()` mengganti placeholder.
3. Atau hapus `parse_mode: 'HTML'` jika formatting HTML tidak dibutuhkan.

Langkah fix secret at-rest:

1. Tambahkan env `TELEGRAM_CONFIG_ENCRYPTION_KEY` atau gunakan KMS/secret manager.
2. Encrypt `botToken` sebelum simpan DB, decrypt hanya saat dipakai.
3. Jangan pernah return token ke frontend; pola saat ini sudah benar (`hasBotToken`).
4. Tandai backup DB sebagai sensitive dan encrypt backup juga.

Verifikasi:

- Backend tests untuk RBAC Telegram.
- Test generated code entropy dan expiry.
- Test subject berisi `<a href=...>` terkirim escaped.
- Manual Telegram check/test notification.

### SEC-011 - Backup protection: plaintext, tidak enforce maintenance di backend, concurrency lock belum ada

Severity: Medium

Referensi:

- `backend/src/maintenance/maintenance.controller.ts:45-49`
- `backend/src/maintenance/maintenance.service.ts:60-86`, `:227-236`
- `scripts/backup.sh:21-39`
- `backend/prisma/schema.prisma:13`, `:230`

Root cause:

- UI disable create backup saat maintenance off, tetapi backend endpoint create backup tidak enforce maintenance mode.
- Backup DB dan uploads disimpan plaintext.
- Backup ID berbasis detik dan check-then-create tanpa lock.
- Backup DB dan uploads tidak snapshot terkoordinasi terhadap live writes.

Impact:

- Admin/API caller dapat membuat backup saat sistem live dan menghasilkan backup inkonsisten.
- File backup mengandung password hash, PII, ticket data, upload user, Telegram bot token.
- Concurrent backup berisiko collision atau partial cleanup.

Langkah fix:

1. Di `MaintenanceService.createBackup()`, cek maintenance mode dan tolak jika disabled, kecuali source internal `pre-restore` atau explicit override yang Admin-only dan logged.
2. Tambahkan Redis lock, misalnya `maintenance:backup:lock` dengan `SET NX EX`.
3. Pastikan lock dilepas di `finally` dan punya TTL cukup lama.
4. Buat directory backup dengan mode private dan atomic, misalnya `fs.mkdtemp` di `backupDir`.
5. Set permission file backup ke `0600` dan directory ke `0700` jika filesystem mendukung.
6. Encrypt backup setelah dibuat, misalnya age/gpg/KMS envelope encryption. Simpan checksum manifest.
7. Jangan expose backup download tanpa audit log. Tambahkan audit event minimal untuk create/download/delete/restore.
8. Untuk script `scripts/backup.sh`, tambahkan `umask 077`, source env sebelum menentukan `BACKUP_ROOT`, dan opsi encryption.
9. Koordinasikan snapshot: maintenance/drain sebelum backup atau gunakan DB snapshot plus upload volume snapshot.

Verifikasi:

- Manual: create backup saat maintenance off return 400/403.
- Manual: concurrent create backup kedua ditolak.
- File permission backup private.
- Backup restore dari encrypted/decrypted file berjalan sesuai prosedur.

### SEC-012 - Redis/deployment hardening dan TLS/security headers

Severity: Medium to High, tergantung environment

Referensi:

- `docker-compose.yml:19-20`, `:84-93`
- `nginx/nginx.conf:38-70`
- `.env.example:5`, `:19-20`, `:34-36`
- `backend/.env.example:6`, `:14`, `:19-22`

Root cause:

- Compose expose nginx hanya port 80.
- Redis service tidak memakai password/persistence.
- Nginx belum set security headers.
- Env examples berisi placeholder weak credential yang mudah tersalin ke production.

Impact:

- Jika dipakai tanpa TLS terminator, login/session traffic cleartext.
- Container lain yang compromise dapat memanipulasi Redis refresh token/maintenance flags.
- Frontend response kurang proteksi clickjacking/MIME sniffing/referrer leakage.
- Weak placeholder dapat menjadi secret production.

Langkah fix deployment/TLS:

1. Konfirmasi apakah config ini local-only atau production behind TLS terminator.
2. Jika nginx terminate TLS, expose `443`, pasang cert, redirect `80 -> 443`.
3. Tambahkan HSTS hanya saat HTTPS benar-benar aktif.
4. Pastikan `X-Forwarded-Proto` benar agar cookie `secure` diset true di production.
5. Pertimbangkan enforce `secure: process.env.NODE_ENV === 'production' || x-forwarded-proto === 'https'` agar production tidak salah cleartext.

Langkah fix security headers nginx:

1. Tambahkan `X-Content-Type-Options: nosniff`.
2. Tambahkan `Referrer-Policy: strict-origin-when-cross-origin`.
3. Tambahkan `Content-Security-Policy` sesuai aset aplikasi. Mulai dari ketat dan longgarkan seperlunya.
4. Tambahkan frame protection lewat CSP `frame-ancestors 'none'` atau `X-Frame-Options DENY`.
5. Tambahkan `Permissions-Policy` minimal.

Langkah fix Redis:

1. Set Redis password, misalnya command `redis-server --requirepass ${REDIS_PASSWORD}` atau config file.
2. Ubah `REDIS_URL=redis://:password@cache:6379`.
3. Jangan inject app secrets lain ke Redis container.
4. Tambahkan volume Redis jika maintenance/session persistence dibutuhkan across restart.

Langkah fix env/compose:

1. Pisahkan env file API dan DB; DB hanya perlu `POSTGRES_*`.
2. Ubah `.env.example` agar placeholder berupa instruksi generated secret, bukan password real-looking.
3. Tambahkan startup validation untuk menolak known weak placeholders di production.

Verifikasi:

- `docker compose up -d` smoke test.
- Login/refresh cookie `Secure` di HTTPS.
- Redis URL auth sukses, tanpa password gagal.
- Security headers muncul di response static dan API bila relevan.

### SEC-013 - React Query Devtools dan query cache setelah restore/logout-like flow

Severity: Medium

Referensi:

- `frontend/src/main.tsx:5`, `:37`
- `frontend/src/pages/AdminMaintenancePage.tsx:101-103`
- `frontend/src/hooks/use-auth.ts:38-41`

Root cause:

- `ReactQueryDevtools` selalu dirender.
- Restore success memanggil `logout()` dari auth store dan navigate, tetapi tidak clear React Query cache seperti hook normal logout.

Impact:

- Devtools di production dapat memperlihatkan cache session saat user masih authenticated.
- Setelah restore, data admin dapat tertinggal di memory cache sampai reload.

Langkah fix:

1. Render devtools hanya di development.
2. Di `AdminMaintenancePage`, ambil `queryClient = useQueryClient()` dan panggil `queryClient.clear()` sebelum navigate login.
3. Pertimbangkan helper logout terpusat agar semua flow clear auth dan cache konsisten.

Contoh:

```tsx
{import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
```

Verifikasi:

- `npm run build` frontend.
- Inspect production build tidak menampilkan devtools UI.
- Manual restore flow membersihkan cache setelah logout.

### SEC-014 - Refresh interceptor frontend tidak update user/role

Severity: Medium

Referensi:

- `frontend/src/lib/axios.ts:60-72`
- `frontend/src/stores/auth-store.ts:30-32`
- `frontend/src/auth/ProtectedRoute.tsx:37-38`

Root cause:

- Refresh endpoint mengembalikan `{ accessToken, user }`, tetapi interceptor hanya memakai `accessToken`.
- Zustand `user` lama tetap dipakai untuk role-gated UI.

Impact:

- Setelah admin ubah role/deactivate, UI bisa tetap menampilkan menu/aksi lama sampai reload.
- Backend tetap authority, tetapi UX/security signal stale.

Langkah fix:

1. Di interceptor refresh, destructure `const { accessToken, user } = response.data`.
2. Jika user ada, update auth store user dan token secara atomik. Bisa tambah method `refreshSession(user, token)` atau pakai `login(user, token)`.
3. Jika role berubah dari sebelumnya, clear query cache untuk mencegah data role lama tetap tampil.
4. Hindari import QueryClient global langsung jika belum ada; bisa buat helper auth event atau centralize refresh di provider.
5. ProtectedRoute akan re-evaluate setelah store user berubah.

Verifikasi:

- Frontend build.
- Manual: ubah role user, biarkan token refresh, UI role mengikuti response baru.

### SEC-015 - EndUser tidak bisa change password

Severity: Low to Medium, tergantung adanya IdP eksternal

Referensi:

- `backend/src/auth/auth.controller.ts:66-69`
- `frontend/src/pages/MyAccountPage.tsx:187-238`

Root cause:

- Backend `change-password` hanya mengizinkan `ITSupport` dan `Admin`.
- UI menyembunyikan form untuk `EndUser`.

Impact:

- EndUser tidak dapat rotasi password sendiri jika tidak ada password management eksternal.
- Menghambat response insiden credential leak.

Langkah fix:

1. Konfirmasi apakah EndUser memakai IdP eksternal. Jika tidak, lanjut fix.
2. Ubah `@Roles(Role.ITSupport, Role.Admin)` menjadi `@Roles(Role.EndUser, Role.ITSupport, Role.Admin)` atau hapus `RolesGuard` karena endpoint sudah butuh JWT dan hanya user sendiri.
3. Tampilkan form change password untuk semua authenticated user.
4. Terapkan SEC-002 agar semua refresh token dicabut setelah password berubah.
5. Setelah sukses change password, logout dan arahkan login ulang.

Verifikasi:

- EndUser dapat change password dengan current password valid.
- Refresh token lama invalid setelah change.
- Frontend build.

### SEC-016 - Seed/env hygiene untuk mencegah credential default production

Severity: Medium

Referensi:

- `backend/prisma/seed.ts:7-19`, `:24-46`, `:173-180`
- `.env.example:2`, `:10`, `:34-36`
- `backend/.env.example:6`, `:9-14`

Root cause:

- Seed non-production memakai credential default `Admin123!` dan `Support123!`.
- Jika seed dijalankan ke DB real dengan `NODE_ENV` tidak production, akun privileged default dibuat.
- Production seed `upsert update: {}` tidak merotasi akun existing yang mungkin dibuat dari dev seed.

Impact:

- Known privileged credentials dapat bertahan di environment real.
- Placeholder env dapat tersalin menjadi secret production.

Langkah fix seed:

1. Tambahkan guard: jika `DATABASE_URL` host bukan local/dev known host, wajibkan `SEED_ADMIN_PASSWORD` dan `SEED_SUPPORT_PASSWORD` walau `NODE_ENV` bukan production.
2. Tambahkan env eksplisit `ALLOW_DEV_SEED=true` untuk memakai password default.
3. Di production, pertimbangkan `update` hash password jika env seed password diberikan dan user existing masih default/atau selalu rotate sesuai policy.
4. Jangan log password default kecuali local dev eksplisit.

Langkah fix env:

1. Ubah example secret menjadi placeholder instruksional, misalnya `JWT_SECRET=<generate-with-openssl-rand-hex-32>`.
2. Tambahkan startup validation di `main.ts` untuk menolak `JWT_SECRET` yang sama dengan known placeholder ketika `NODE_ENV=production`.
3. Pisahkan contoh env Docker dan local agar tidak salah host `localhost` dalam container.

Verifikasi:

- Seed local dengan `ALLOW_DEV_SEED=true` sukses.
- Seed non-local tanpa password env gagal.
- Startup production dengan placeholder `JWT_SECRET` gagal cepat.

## Temuan Tambahan Yang Perlu Dijadwalkan

| ID | Severity | Referensi | Masalah | Fix ringkas |
|---|---|---|---|---|
| SEC-017 | Low | `backend/src/tickets/tickets.service.ts:279-285`, `backend/src/comments/comments.service.ts:165-171`, `backend/src/attachments/attachments.service.ts:146-155` | EndUser bisa membedakan resource missing vs forbidden | Untuk EndUser query dengan owner filter dan return 404 untuk miss |
| SEC-018 | Low | `backend/src/comments/comments.controller.ts:61-77`, `backend/src/comments/dto/create-comment.dto.ts:4-10` | Multipart comment bypass DTO enum/length validation | Gunakan DTO validasi untuk multipart fields, tambahkan `MaxLength` |
| SEC-019 | Medium | `backend/src/tickets/tickets.service.ts:348-360`, `:391-407`, `:427-441` | Ticket update dan history insert tidak atomic | Masukkan update dan history dalam satu Prisma transaction ✅ Fixed Sprint 3 |
| SEC-020 | Medium | `backend/src/tickets/tickets.service.ts:382-386` | Assignment bisa ke inactive ITSupport/Admin | Reject `!assignedUser.isActive` ✅ Fixed Sprint 2 |
| SEC-021 | Medium | `backend/src/telegram/telegram.service.ts:48-58`, `:95-119`, `:221-222` | Telegram polling bisa duplicate setelah update config | Track timeout/AbortController/generation ID |
| SEC-022 | Low | `backend/src/health/health.controller.ts:30-49`, `docker-compose.yml:43-48` | Docker healthcheck tetap 200 saat dependency unhealthy | Return non-2xx atau healthcheck parse body |
| SEC-023 | Medium | `nginx/nginx.conf:53-63` | WebSocket timeout panjang tanpa connection limiting | Tambah `limit_conn`, idle timeout, monitoring |
| SEC-024 | Low | `scripts/backup.sh:5`, `:11-15` | `BACKUP_DIR` dari env tidak dipakai karena dihitung sebelum source env | Source env sebelum set `BACKUP_ROOT` |

## Catatan Positif

- Access token tidak dipersist ke `localStorage` atau `sessionStorage`; grep hanya menemukan theme storage di `frontend/src/main.tsx:19`.
- Refresh token diset via cookie httpOnly dan tidak dikembalikan di body controller login/refresh: `backend/src/auth/auth.controller.ts:33-43`, `:54-63`.
- `JwtStrategy` re-check user aktif dari DB: `backend/src/auth/strategies/jwt.strategy.ts:16-23`.
- `RolesGuard` memakai `request.user.role` hasil DB-loaded strategy, bukan role claim mentah saja: `backend/src/common/guards/roles.guard.ts:24-32`.
- Telegram config response tidak mengirim bot token atau group chat id mentah: `backend/src/telegram/telegram.service.ts:173-185`.
- `.env`, `backend/.env`, dan `backups/` tidak tracked menurut command `git ls-files`; hanya `CODE_REVIEW.md` tracked.
- Frontend production dependency audit bersih: `npm audit --omit=dev` di `frontend` return 0 vulnerabilities.

## Command Yang Sudah Dijalankan Saat Review

```bash
npm audit --omit=dev
```

Workdir `backend`: menghasilkan 16 vulnerabilities, 12 moderate dan 4 high.

```bash
npm audit --omit=dev
```

Workdir `frontend`: `found 0 vulnerabilities`.

```bash
git ls-files --stage -- backend/.env .env backups CODE_REVIEW.md
```

Hasil: hanya `CODE_REVIEW.md` yang tracked dari daftar tersebut.

## Rekomendasi Urutan Implementasi

### Sprint Fix 1 - P0 Security Closure

Target: tutup risiko token/session/archive/dependency paling tinggi.

1. Implement SEC-001 WebSocket token query removal.
2. Implement SEC-002 refresh token revocation on password changes/admin resets/deactivation.
3. Implement SEC-003 safe tar restore validation/extraction.
4. Implement SEC-004 backend dependency upgrade sampai tidak ada high vulnerability.
5. Jalankan `npm test` dan `npm run build` di backend.
6. Lakukan smoke test login, refresh, upload/download, backup/restore, notification socket.

### Sprint Fix 2 - Authorization/Data Exposure

Target: align backend dengan policy role dan cegah internal data exposure.

1. Implement SEC-005 endpoint assignable-users dan restrict `/users` ke Admin.
2. Implement SEC-006 omit/gate histories untuk EndUser.
3. Implement SEC-007 attachment visibility model.
4. Implement SEC-020 reject assignment ke inactive users.
5. Jalankan backend tests/build dan frontend build.
6. Manual login sebagai EndUser, ITSupport, Admin untuk cek route/API behavior.

### Sprint Fix 3 - Upload, Telegram, DoS, Backup Ops

Target: hardening abuse paths.

1. Implement SEC-008 upload/download hardening.
2. Implement SEC-009 bounded pagination.
3. Implement SEC-010 Telegram hardening.
4. Implement SEC-011 backup encryption/lock/maintenance enforcement.
5. Implement SEC-019 atomic ticket history.
6. Jalankan backend tests/build dan manual upload/Telegram/backup smoke.

### Sprint Fix 4 - Deployment And Frontend Hygiene

Target: production readiness dan future-proofing.

1. Implement SEC-012 Redis/TLS/security headers/env split sesuai environment target.
2. Implement SEC-013 devtools dev-only dan cache clear restore flow.
3. Implement SEC-014 refresh user state update.
4. Implement SEC-015 EndUser password change jika tidak ada IdP eksternal.
5. Implement SEC-016 seed/env guard.
6. Jalankan frontend build/lint, backend build/test, dan compose smoke test bila config berubah.

## Verification Matrix

| Area berubah | Command minimum | Manual smoke |
|---|---|---|
| Backend auth/session/RBAC | `npm test`, `npm run build` di `backend` | Login, refresh, logout, change password, role access |
| Backend uploads/downloads | `npm test`, `npm run build` di `backend` | Upload valid, upload invalid MIME, download with odd filename, missing file |
| Backup/restore | `npm run build` di `backend` | Create backup, restore valid backup, reject malicious tar |
| Telegram | `npm run build` di `backend` | Check config, link, send test notification |
| Frontend auth/routing | `npm run build`, `npm run lint` di `frontend` | Role gated menu/pages, refresh after role change |
| Docker/nginx/env | `docker compose up -d` atau targeted build | Login through nginx, headers, WebSocket, upload size |

## Open Questions Untuk Pemilik Project

1. Apakah `nginx` HTTP-only ini benar-benar hanya untuk local/dev, atau ada TLS terminator di depan production?
2. Apakah Telegram linking memang Admin-only seperti UI saat ini, atau semua role boleh link akun Telegram pribadi?
3. Apakah EndUser boleh melihat audit trail/SLA detail, atau seluruh workflow history harus internal untuk staff?
4. Untuk attachment staff, default visibility yang diinginkan public atau internal?
5. Apakah ada IdP/password management eksternal untuk EndUser? Jika tidak ada, EndUser harus bisa change password.

## Notes Untuk Agent Berikutnya

- Mulai dari checklist `SEC-001` sampai `SEC-004` jika diminta fixing keamanan prioritas tinggi.
- Jangan ubah Docker HTTP/HTTPS flow tanpa konfirmasi jika ternyata environment ini memang local-only, sesuai catatan `AGENTS.md`.
- Jangan persist access token di storage apapun.
- Jangan expose Telegram secrets ke frontend; pertahankan pola `hasBotToken` dan `hasGroupChatId`.
- Jangan revert file lain yang mungkin diubah user/agent lain.
- Setelah menyelesaikan tiap SEC item, update checklist di dokumen ini dengan status `[x]` dan tulis ringkasan commit/file/test di bawah item terkait jika perlu.
