# Code Review - Bug & Edge Case Findings

Tanggal review: 2026-06-25

Scope review: backend NestJS, frontend React/Vite, Docker/Nginx, seed, backup/restore, dan operational edge cases.

Fokus: bug, edge case, security-impacting behavior, data consistency, dan runtime/deployment mismatch.

## Status Ringkas

Temuan prioritas tertinggi:

- `CR-01` Critical - upload filename bisa path traversal / arbitrary write.
- `CR-02` Critical - restore gagal tetap mematikan maintenance mode.
- `CR-03` High - seed production membuat user privileged dengan password publik.
- `CR-04` High - production Docker startup bergantung pada Prisma CLI yang tidak ada di image.
- `CR-05` High - ticket creation pecah setelah `TKT-999`.
- `CR-06` High - Telegram group chat ID bocor ke frontend.

Rekomendasi urutan pengerjaan:

1. Fix security/data-corruption dulu: `CR-01`, `CR-02`, `CR-06`.
2. Fix deployment blocker: `CR-04`, `CR-03`.
3. Fix workflow/data correctness: `CR-05`, `CR-07`, `CR-08`, `CR-09`.
4. Fix hardening medium: `CR-10`, `CR-11`, `CR-12`.

## Findings & Detailed Fix Plan

### CR-01 - Critical - Upload Filename Bisa Path Traversal / Arbitrary Write

Lokasi:

- `backend/src/attachments/attachments.service.ts:77-81`
- `backend/src/comments/comments.service.ts:109-115`
- `backend/src/attachments/services/local-storage.service.ts:9-14`

Root cause:

- `file.originalname` dari multipart request dipakai langsung untuk membuat path: `${uuidv4()}-${file.originalname}`.
- Jika filename mengandung `../`, path separator, atau path absolut, hasil akhirnya bisa keluar dari `UPLOAD_DIR`.
- `LocalStorageService.save()` langsung membuat directory dan menulis file tanpa containment check.

Impact:

- User authenticated yang bisa upload attachment/comment file dapat menulis file di luar upload directory.
- Ini bisa menjadi arbitrary file write tergantung permission container/process.

Fix detail:

- Jangan pakai `file.originalname` sebagai bagian dari path storage.
- Simpan `originalName` di database hanya untuk display/download filename.
- Buat storage filename server-side, misalnya `${uuidv4()}${ext}`.
- Ambil extension secara aman dari basename saja: `path.extname(path.basename(file.originalname))`.
- Resolve upload root dengan `path.resolve(process.env.UPLOAD_DIR || './uploads')`.
- Build final path dengan `path.join(uploadRoot, safeName)`.
- Validate containment: `resolvedPath.startsWith(uploadRoot + path.sep)` atau `resolvedPath === uploadRoot` handling sesuai kebutuhan.
- Tambahkan containment check juga di `LocalStorageService.save()` sebagai defense-in-depth.
- Pertimbangkan menolak filename kosong/extension aneh jika MIME tidak sesuai allowed list.

Implementation checklist:

- [ ] Tambahkan helper kecil untuk membuat safe upload path, idealnya reusable untuk attachment upload dan comment upload.
- [ ] Update `AttachmentsService.upload()` memakai safe path.
- [ ] Update `CommentsService.create()` file loop memakai safe path.
- [ ] Update `LocalStorageService.save()` untuk normalize path dan reject path di luar upload root.
- [ ] Pastikan database field `originalName` tetap menyimpan nama asli untuk UI.
- [ ] Pastikan field `path` hanya menyimpan path aman hasil server.

Verification checklist:

- [ ] Unit/integration test upload filename normal tetap sukses.
- [ ] Test filename `../../evil.txt` gagal atau tersimpan sebagai filename aman di upload root.
- [ ] Test filename `subdir/file.txt` tidak membuat subdirectory dari input user.
- [ ] Test comment upload dan direct ticket attachment upload sama-sama aman.
- [ ] Jalankan `npm test` atau minimal test backend terkait upload.
- [ ] Jalankan `npm run build` di `backend`.

### CR-02 - Critical - Restore Gagal Tetap Mematikan Maintenance Mode

Lokasi:

- `backend/src/maintenance/maintenance.service.ts:182-195`
- `backend/src/maintenance/maintenance.service.ts:248-288`

Root cause:

- `restoreBackup()` selalu menjalankan `await this.setMaintenanceMode(false)` di `finally`.
- Restore DB melakukan `DROP SCHEMA ... CASCADE` sebelum import backup.
- Restore uploads menghapus isi upload directory sebelum extract archive.
- Jika import DB atau extract uploads gagal, maintenance tetap dimatikan.

Impact:

- User bisa mengakses aplikasi saat DB sudah drop atau hanya sebagian ter-restore.
- Uploads bisa kosong/parsial tetapi aplikasi kembali menerima request.
- Pre-restore backup bisa tidak konsisten karena dibuat sebelum maintenance/drain aktif.

Fix detail:

- Jangan disable maintenance di `finally` tanpa status sukses.
- Gunakan flag `restoreSucceeded`.
- Aktifkan maintenance dan drain sebelum membuat pre-restore backup agar backup rollback konsisten.
- Jika restore gagal, biarkan maintenance tetap aktif dan return error yang menjelaskan lokasi pre-restore backup.
- Jika restore sukses, baru disable maintenance atau restore state maintenance sebelumnya sesuai keputusan produk.
- Pertimbangkan urutan yang lebih aman:

```ts
let restoreSucceeded = false;
let preRestoreBackup: BackupInfo | null = null;

await this.setMaintenanceMode(true, 'Sedang restore data. Silakan tunggu beberapa saat...');
await delay(DRAIN_TIME_MS);

try {
  preRestoreBackup = await this.createBackup('pre-restore');
  await this.restoreDatabase(dbPath);
  await this.restoreUploads(uploadsPath);
  restoreSucceeded = true;
  return preRestoreBackup;
} catch (error) {
  // Keep maintenance enabled intentionally.
  throw new BadRequestException(...);
} finally {
  if (restoreSucceeded) {
    await this.setMaintenanceMode(false);
  }
}
```

- Untuk hardening, restore DB bisa dilakukan ke schema sementara lalu swap, tetapi itu perubahan lebih besar.

Implementation checklist:

- [ ] Pindahkan `createBackup('pre-restore')` setelah maintenance aktif dan drain selesai.
- [ ] Tambahkan `restoreSucceeded` flag.
- [ ] Hapus unconditional disable maintenance dari `finally`.
- [ ] Pada catch, tulis log jelas bahwa maintenance sengaja tetap aktif.
- [ ] Pastikan response error tidak expose command internals berbahaya.
- [ ] Pertimbangkan return `preRestoreBackup` id di error response hanya jika aman/berguna untuk Admin.

Verification checklist:

- [ ] Simulasikan restore sukses, maintenance mati setelah sukses.
- [ ] Simulasikan DB restore gagal setelah `DROP SCHEMA`, maintenance tetap aktif.
- [ ] Simulasikan uploads extract gagal, maintenance tetap aktif.
- [ ] Pastikan Admin masih bisa akses endpoint maintenance saat maintenance aktif.
- [ ] Jalankan backend test/build relevan.

### CR-03 - High - Seed Production Membuat User Privileged Dengan Password Publik

Lokasi:

- `backend/prisma/seed.ts:7-31`
- `README.md:216-220`
- `README.md:257-263`

Root cause:

- Seed membuat `admin@company.com / Admin123!` dan `support@company.com / Support123!`.
- README Docker fresh install menginstruksikan menjalankan seed manual.
- Tidak ada guard yang membedakan dev/demo seed dan production provisioning.

Impact:

- Deployment nyata yang mengikuti README bisa online dengan credential admin/support yang diketahui publik.
- Jika operator lupa mengganti password, risiko account takeover tinggi.

Fix detail:

- Tentukan policy seed:
  - Dev/demo: credential fixed boleh dipakai.
  - Production: credential fixed tidak boleh dibuat.
- Opsi minimal:
  - Jika `NODE_ENV === 'production'`, seed require env `SEED_ADMIN_PASSWORD` dan `SEED_SUPPORT_PASSWORD`.
  - Jika env tidak ada, throw error dengan pesan jelas.
- Opsi lebih aman:
  - Production hanya membuat admin jika `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD` diset.
  - Jangan buat support default di production kecuali env lengkap disediakan.
- Jangan log password production ke stdout.
- Update README:
  - Pisahkan `Local/demo seed` dan `Production provisioning`.
  - Jelaskan bahwa password default hanya untuk dev.

Implementation checklist:

- [ ] Update `backend/prisma/seed.ts` agar fixed password hanya untuk non-production.
- [ ] Tambahkan env variable optional/required untuk production seed.
- [ ] Jangan print credential production di console.
- [ ] Update `.env.example` jika env seed production dipilih.
- [ ] Update README Quick Start agar jelas dev vs production.

Verification checklist:

- [ ] `NODE_ENV=development npm run prisma:seed` tetap membuat default dev credentials.
- [ ] `NODE_ENV=production` tanpa seed password gagal eksplisit.
- [ ] `NODE_ENV=production` dengan env password membuat user dan tidak mencetak password.
- [ ] Login dengan password env berhasil.

### CR-04 - High - Production Docker Startup Bergantung Pada Prisma CLI Yang Tidak Ada Di Image

Lokasi:

- `backend/Dockerfile:31-45`
- `backend/package.json:45-58`

Root cause:

- Production image menjalankan `npm ci --omit=dev`.
- Package `prisma` ada di `devDependencies`.
- CMD tetap menjalankan `npx prisma migrate deploy`.
- `npx` bisa mencoba download Prisma CLI saat runtime atau gagal di restricted/offline environment.

Impact:

- Container startup tidak deterministik.
- Runtime bisa memakai CLI versi tidak sesuai lockfile jika `npx` download.
- Deployment bisa gagal walau image build sukses.

Fix detail:

- Pastikan Prisma CLI pinned tersedia dalam production image.
- Opsi A: pindahkan `prisma` ke `dependencies` agar ikut `npm ci --omit=dev`.
- Opsi B: copy Prisma CLI dari builder stage ke production image. Ini lebih tricky karena dependency tree CLI harus lengkap.
- Setelah CLI tersedia, ubah CMD ke `npx --no-install prisma migrate deploy && node dist/src/main` agar tidak download runtime.
- Alternatif lebih operasional: migrate dilakukan oleh job terpisah, bukan app container startup. Tapi ini perubahan deployment lebih besar.

Implementation checklist:

- [ ] Pilih strategi: `prisma` sebagai dependency runtime atau migration job terpisah.
- [ ] Jika tetap startup migration, update Dockerfile CMD pakai `npx --no-install prisma migrate deploy`.
- [ ] Pastikan `@prisma/client` dan generated client tetap tersedia.
- [ ] Build image tanpa network runtime dependency.

Verification checklist:

- [ ] `docker compose build api` sukses.
- [ ] `docker compose up -d api` sukses di environment tanpa internet runtime.
- [ ] Log tidak menunjukkan `npx` installing/downloading package.
- [ ] Pending migration tetap diterapkan.

### CR-05 - High - Ticket Creation Pecah Setelah `TKT-999`

Lokasi:

- `backend/src/tickets/tickets.service.ts:499-512`

Root cause:

- `generateTicketNumber()` mengambil last ticket dengan `orderBy: { ticketNumber: 'desc' }`.
- `ticketNumber` adalah string, sehingga sorting lexicographic tidak sama dengan numeric suffix.
- Contoh: `TKT-999` bisa dianggap lebih besar dari `TKT-1000`.

Impact:

- Setelah volume tertentu, create ticket bisa terus mencoba duplicate number.
- Retry loop tidak menyelesaikan karena sumber next number tetap salah.

Fix detail:

- Opsi terbaik: tambah numeric sequence/counter di database.
- Opsi minimal tanpa schema besar:
  - Query ticket number terakhir berdasarkan numeric suffix dengan raw SQL safe.
  - Atau tambah model `Counter` / `TicketSequence` dengan row `ticketNumber` dan increment transactionally.
- Hindari mengandalkan parsing string hasil sort lexicographic.
- Jika menambah model counter:
  - Migration create table counter dengan `name` unique dan `value` int.
  - Dalam transaction serializable, upsert/increment counter lalu format `TKT-${value}`.

Implementation checklist:

- [ ] Pilih pendekatan sequence/counter.
- [ ] Tambah migration jika butuh table/column baru.
- [ ] Update `generateTicketNumber()` agar tidak sort string.
- [ ] Pertahankan unique index `tickets.ticketNumber` sebagai safety net.
- [ ] Tambahkan test untuk existing `TKT-999` lalu create menghasilkan `TKT-1000` atau `TKT-1001` sesuai dataset.

Verification checklist:

- [ ] Test create ticket pertama menghasilkan `TKT-001`.
- [ ] Test dengan ticket terakhir `TKT-999`, next bukan duplicate `TKT-1000` loop.
- [ ] Test concurrent create ticket tidak duplicate.
- [ ] Jalankan backend tests.

### CR-06 - High - Telegram Group Chat ID Bocor Ke Frontend

Lokasi:

- `backend/src/telegram/telegram.service.ts:173-184`

Root cause:

- `getConfig()` return `settings` langsung dari DB.
- `settings` bisa berisi `groupChatId`.
- Response juga menyediakan `hasGroupChatId`, yang menunjukkan intended pattern adalah secret-presence flag.

Impact:

- Group chat ID dikirim ke frontend.
- Melanggar aturan project: jangan expose Telegram secrets; return flags seperti `hasBotToken` / `hasGroupChatId`.

Fix detail:

- Sanitize config response:
  - `botToken: ''`
  - `hasBotToken: boolean`
  - `hasGroupChatId: boolean`
  - `settings` tanpa `groupChatId`
- Saat update, backend tetap boleh menerima `settings.groupChatId` untuk save/clear.
- Jika frontend perlu menampilkan placeholder, gunakan flag `hasGroupChatId`, bukan value asli.
- Pastikan templates dan enabled events tetap dikirim.

Implementation checklist:

- [ ] Update `TelegramService.getConfig()` untuk destructure `groupChatId` keluar dari returned settings.
- [ ] Pastikan `updateConfig()` masih bisa menerima group chat ID dari admin.
- [ ] Update frontend typing jika saat ini menganggap `settings.groupChatId` selalu ada.
- [ ] Tambahkan backend test untuk memastikan response tidak mengandung `groupChatId`.

Verification checklist:

- [ ] `GET /api/telegram/config` tidak mengandung `groupChatId` value.
- [ ] `hasGroupChatId` true jika value tersimpan.
- [ ] Admin masih bisa update group chat ID.
- [ ] Frontend save config tetap jalan.

### CR-07 - Medium - EndUser Tidak Bisa Close Ticket Resolved Dari UI

Lokasi:

- `backend/src/tickets/tickets.service.ts:281-290`
- `frontend/src/components/tickets/TicketDetail.tsx:65-67`
- `frontend/src/components/tickets/TicketDetail.tsx:111-123`

Root cause:

- Backend mendukung EndUser close own ticket jika status `Resolved`.
- Frontend hanya render status action untuk `ITSupport` dan `Admin`.

Impact:

- EndUser tidak bisa menyelesaikan workflow `Resolved -> Closed` dari UI.

Fix detail:

- Tambahkan computed permission khusus:
  - `canCloseOwnResolvedTicket = user?.role === 'EndUser' && ticket.requesterId === user.id && ticket.status === 'Resolved'`.
- Render tombol `Close Ticket` untuk kondisi itu.
- Jangan tampilkan semua transition status ke EndUser.
- Reuse `useUpdateTicketStatus()` dengan payload `{ status: 'Closed' }`.

Implementation checklist:

- [ ] Update `TicketDetail.tsx` permission logic.
- [ ] Tambah button EndUser close scoped.
- [ ] Pastikan ITSupport/Admin status flow tetap seperti sekarang.
- [ ] Tambahkan test/manual validation dengan EndUser requester.

Verification checklist:

- [ ] EndUser requester melihat tombol close saat ticket `Resolved`.
- [ ] EndUser bukan requester tidak bisa akses/detail sesuai backend.
- [ ] EndUser tidak melihat tombol close saat status selain `Resolved`.
- [ ] ITSupport/Admin workflow tidak berubah.

### CR-08 - Medium - Axios Refresh Queue Bisa Menggantung

Lokasi:

- `frontend/src/lib/axios.ts:44-80`

Root cause:

- Saat refresh sedang berjalan, request 401 lain dimasukkan ke `failedQueue`.
- Jika refresh response berhasil tapi `accessToken` kosong, branch `if (!accessToken)` logout/redirect tanpa memanggil `processQueue()`.

Impact:

- Request concurrent bisa pending selamanya.
- UI bisa stuck loading setelah sesi expired/missing refresh cookie.

Fix detail:

- Di branch `!accessToken`, buat error object lalu panggil `processQueue(authError, null)` sebelum logout/redirect.
- Pastikan `isRefreshing` di-reset di `finally` tetap berjalan.
- Pertimbangkan menyamakan handling `accessToken null` dengan catch refresh error.

Implementation checklist:

- [ ] Update branch `if (!accessToken)` untuk reject queue.
- [ ] Pastikan queue dikosongkan pada semua path failure.
- [ ] Hindari double redirect jika banyak request gagal bersamaan.

Verification checklist:

- [ ] Simulasikan beberapa request 401 bersamaan dengan refresh cookie missing.
- [ ] Semua promise reject, tidak pending.
- [ ] User diarahkan ke `/login` sekali.

### CR-09 - Medium - Realtime Notification Tidak Jalan Lewat Nginx

Lokasi:

- `backend/src/notifications/notifications.gateway.ts:25-28`
- `nginx/nginx.conf:43-50`

Root cause:

- Socket.IO gateway memakai namespace `/notifications` tetapi default transport path tetap `/socket.io/`.
- Nginx hanya proxy `/api/` ke backend.
- Tidak ada websocket upgrade proxy headers.
- Frontend saat ini juga tidak terlihat memiliki Socket.IO client subscription, sehingga fitur realtime belum tersambung end-to-end.

Impact:

- Realtime notifications tidak berfungsi melalui deployed Nginx entrypoint.
- Badge/notification UI bergantung pada fetch manual dan bisa stale.

Fix detail:

- Tambah Nginx location untuk Socket.IO:

```nginx
location /socket.io/ {
  proxy_pass http://api:3000/socket.io/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

- Atau configure Socket.IO path di bawah `/api/socket.io/` dan proxy lewat `/api/` dengan upgrade support.
- Tambahkan frontend socket client jika memang realtime notification ingin dipakai.

Implementation checklist:

- [ ] Tentukan path Socket.IO final.
- [ ] Update `nginx/nginx.conf` dengan websocket proxy.
- [ ] Tambah/cek frontend socket subscription ke namespace `/notifications`.
- [ ] Pastikan token dikirim via `handshake.auth`, bukan query string.

Verification checklist:

- [ ] Browser bisa connect Socket.IO lewat Nginx.
- [ ] Event `notification.created` muncul realtime di UI.
- [ ] Reconnect setelah refresh halaman bekerja.
- [ ] Tidak ada token di URL/query logs.

### CR-10 - Medium - Konfigurasi DB Bisa Mismatch Antara API, Postgres, Dan Backup

Lokasi:

- `docker-compose.yml:42`
- `docker-compose.yml:70-75`
- `scripts/backup.sh:14-26`

Root cause:

- API membaca env dari `backend/.env`.
- Service `db` membaca `${POSTGRES_USER}`, `${POSTGRES_PASSWORD}`, `${POSTGRES_DB}` dari root compose interpolation/shell/root `.env` default.
- `backup.sh` membaca root `.env`, bukan `backend/.env`.

Impact:

- Operator bisa mengubah `backend/.env` sesuai docs, tetapi DB tetap memakai default compose.
- API migration bisa gagal karena credential/database mismatch.
- Backup script bisa membackup database yang salah atau gagal connect.

Fix detail:

- Pilih satu canonical env file untuk Compose.
- Opsi minimal:
  - Tambah `env_file: ./backend/.env` juga ke service `db` tidak cukup untuk compose variable interpolation di `environment`. Lebih aman gunakan explicit `environment` yang sama atau root `.env` canonical.
  - Update docs: Docker harus copy `.env.example` ke `.env`, bukan `backend/.env`, jika compose interpolation dipakai.
  - API bisa pakai `env_file: ./.env` juga agar sama.
- Update `backup.sh` agar membaca env canonical yang sama.

Implementation checklist:

- [ ] Putuskan canonical env: root `.env` atau `backend/.env`.
- [ ] Update `docker-compose.yml` agar API dan DB memakai sumber sama.
- [ ] Update `scripts/backup.sh` membaca sumber sama.
- [ ] Update README setup instructions.
- [ ] Pastikan tidak commit secret `.env`.

Verification checklist:

- [ ] Ubah POSTGRES credential di canonical env, `docker compose up` tetap sehat.
- [ ] API migration connect ke DB yang sama.
- [ ] `scripts/backup.sh` backup DB yang sama.

### CR-11 - Medium - EndUser Bisa Infer Internal Activity Dari `_count`

Lokasi:

- `backend/src/tickets/tickets.service.ts:142-148`
- `backend/src/tickets/tickets.service.ts:239-261`

Root cause:

- EndUser detail/list memfilter internal comments/attachments dari relation data.
- `_count` tetap menghitung semua comments/attachments, termasuk internal.

Impact:

- EndUser bisa mengetahui ada internal comment/attachment pada ticket mereka.
- Ini melanggar rule bahwa internal comments/attachments tidak returned/displayed ke EndUser jika count dipakai di UI/API.

Fix detail:

- Untuk EndUser, jangan return raw `_count` dari Prisma.
- Opsi simple:
  - Setelah fetch detail, override `_count.comments = ticket.comments.length` dan `_count.attachments = ticket.attachments.length` untuk EndUser.
  - Untuk list, omit `_count` untuk EndUser atau compute visible counts dengan separate filtered counts.
- Untuk ITSupport/Admin, `_count` full tetap boleh.

Implementation checklist:

- [ ] Audit UI apakah `_count` dipakai untuk EndUser list/detail.
- [ ] Adjust backend response untuk EndUser agar count visible-only atau omitted.
- [ ] Pastikan TypeScript types frontend tetap cocok.

Verification checklist:

- [ ] Buat ticket dengan internal comment dan public comment.
- [ ] Login EndUser, response tidak menunjukkan count internal.
- [ ] Login Admin, response count full tetap benar.

### CR-12 - Medium - SLA Create/Update Tidak Tervalidasi Runtime

Lokasi:

- `backend/src/sla/sla.controller.ts:26-38`
- `backend/src/sla/sla.controller.ts:41-53`

Root cause:

- Controller body memakai inline TypeScript object type.
- `ValidationPipe` butuh class DTO dengan decorators agar validasi runtime berjalan.

Impact:

- Invalid priority, string duration, zero/negative duration, atau extra fields bisa masuk ke service.
- Bisa menjadi Prisma error/500 atau data SLA tidak valid.

Fix detail:

- Tambahkan DTO files:
  - `backend/src/sla/dto/create-sla-config.dto.ts`
  - `backend/src/sla/dto/update-sla-config.dto.ts`
- Decorators yang disarankan:
  - `categoryId`: `@IsUUID()`
  - `priority`: `@IsEnum(Priority)`
  - `responseTimeMinutes`: `@Type(() => Number)`, `@IsInt()`, `@Min(1)`
  - `resolutionTimeMinutes`: `@Type(() => Number)`, `@IsInt()`, `@Min(1)`
  - `isActive`: `@IsBoolean()` untuk update
- Update controller memakai DTO class.

Implementation checklist:

- [ ] Tambah DTO create/update SLA.
- [ ] Update `SLAController.create()` body type.
- [ ] Update `SLAController.update()` body type.
- [ ] Tambah test invalid payload return 400, bukan 500.

Verification checklist:

- [ ] POST invalid priority return 400.
- [ ] POST negative minutes return 400.
- [ ] PATCH extra field return 400 karena `forbidNonWhitelisted`.
- [ ] Valid payload tetap sukses.

## Additional Medium/Low Candidates To Re-check Later

Item ini belum menjadi prioritas utama, tetapi layak dicek setelah 12 temuan utama selesai:

- Password change tidak revoke semua refresh token lama: `backend/src/auth/auth.service.ts:86-105`.
- ITSupport bisa enumerate `/users`: `backend/src/users/users.controller.ts:25-27`; ini mungkin intentional untuk assign dropdown, tapi endpoint terlalu luas.
- EndUser tidak bisa change password karena endpoint hanya ITSupport/Admin: `backend/src/auth/auth.controller.ts:66-69`; cocokkan lagi dengan product rule My Account untuk semua role.
- Assign ticket tidak cek `assignedUser.isActive`: `backend/src/tickets/tickets.service.ts:351-354`.
- Nginx `client_max_body_size 10m` konflik dengan comment upload 3 x 5MB: `nginx/nginx.conf:41`, comments upload limit.
- Nginx `proxy_read_timeout 60s` terlalu pendek untuk backup/restore besar: `nginx/nginx.conf:49`.
- Health endpoint return HTTP 200 walau dependency unhealthy: `backend/src/health/health.controller.ts:44-49`.
- Direct attachment download stream belum handle missing file/read error dengan aman.
- Telegram singleton config tidak enforced unique row; `findFirst()` bisa inconsistent jika duplicate rows tercipta.
- Frontend create ticket plus attachment upload bersifat partial: ticket sudah dibuat tetapi upload gagal, user bisa retry dan membuat duplicate ticket.
- Frontend manual `Content-Type: multipart/form-data` di comment upload sebaiknya dihapus agar browser/axios set boundary sendiri.
- Frontend Telegram config default empty bisa menghapus default enabled events/templates pada first save.

## Session Handoff Checklist Untuk Agent Berikutnya

Gunakan checklist ini saat session baru agar konteks tidak hilang.

### Context Gathering Wajib

- [ ] Baca `AGENTS.md`.
- [ ] Baca file ini: `CODE_REVIEW_BUG_EDGE_CASES.md`.
- [ ] Cek status git: `git status --short` atau wrapper repo yang tersedia.
- [ ] Cek apakah ada perubahan user yang belum di-commit; jangan revert perubahan user.
- [ ] Pilih hanya satu finding per sesi/commit kecuali user minta batch.
- [ ] Baca ulang source file sesuai finding yang dipilih sebelum edit.

### Planning Wajib Untuk Fix Multi-file

- [ ] Tulis plan singkat sebelum edit.
- [ ] Cantumkan file yang akan diubah.
- [ ] Cantumkan root cause yang akan diperbaiki.
- [ ] Cantumkan verification command yang akan dijalankan.
- [ ] Jika ada lebih dari satu pendekatan valid atau perubahan behavior, tanya user dulu.

### Execution Guardrails

- [ ] Buat perubahan sesempit mungkin.
- [ ] Jangan refactor besar jika tidak perlu untuk finding tersebut.
- [ ] Jangan tambah fallback hardcoded untuk `JWT_SECRET`, `DATABASE_URL`, atau `REDIS_URL`.
- [ ] Jangan expose Telegram token/group chat secret ke frontend.
- [ ] Jangan persist access token ke storage browser.
- [ ] Jangan ubah Docker HTTP/HTTPS flow kecuali finding yang dikerjakan memang perlu.
- [ ] Jangan jalankan destructive command seperti `docker compose down -v` atau git reset/checkout.

### Verification Per Area

- [ ] Backend code change: jalankan `npm test` atau test spesifik relevan di `backend` jika tersedia.
- [ ] Backend build-sensitive change: jalankan `npm run build` di `backend`.
- [ ] Frontend code change: jalankan `npm run lint` dan/atau `npm run build` di `frontend` sesuai scope.
- [ ] Docker/Nginx change: jalankan config/build command relevan jika feasible, minimal jelaskan jika tidak dijalankan.
- [ ] Docs-only change: test/lint tidak wajib; laporkan bahwa perubahan hanya dokumentasi.

### Reporting Akhir

- [ ] Sebutkan finding ID yang ditangani.
- [ ] Sebutkan file yang diubah.
- [ ] Jelaskan behavior change secara eksplisit.
- [ ] Cantumkan verification command dan hasilnya.
- [ ] Jika ada sisa risiko atau test yang tidak bisa dijalankan, jelaskan.

### Commit Discipline

- [ ] Commit hanya jika user meminta.
- [ ] Satu finding logis = satu commit.
- [ ] Sebelum commit, cek `git status`, `git diff`, dan `git log --oneline -10`.
- [ ] Stage hanya file yang relevan.
- [ ] Jangan commit secret, `.env`, backup data, uploads, atau generated artifact tidak relevan.

## Suggested Fix Order Checklist

- [ ] `CR-01` Secure upload path handling.
- [ ] `CR-02` Keep maintenance enabled on failed restore.
- [ ] `CR-06` Sanitize Telegram config response.
- [ ] `CR-04` Make Prisma migrate CLI deterministic in production image.
- [ ] `CR-03` Make production seed safe.
- [ ] `CR-05` Replace ticket number string sort with sequence/counter.
- [ ] `CR-07` Add EndUser close resolved ticket UI action.
- [ ] `CR-08` Reject axios refresh queue on null access token.
- [ ] `CR-09` Add Socket.IO Nginx proxy and frontend realtime subscription if intended.
- [ ] `CR-10` Unify Compose/API/backup env source.
- [ ] `CR-11` Hide internal `_count` from EndUser.
- [ ] `CR-12` Add runtime DTO validation for SLA configs.
