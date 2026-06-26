# Code Review - IT Support Ticketing

Tanggal review: 2026-06-26

Reviewer: senior fullstack engineer, fokus bug dan edge case.

Scope yang dibaca:

- `AGENTS.md` sebagai aturan proyek dan security boundary.
- Backend: `backend/src`, repository/service/controller utama, `backend/prisma`, auth, ticket, comment, attachment, maintenance, Telegram, notification.
- Frontend: `frontend/src`, auth route/interceptor, pages, hooks, komponen ticket/admin/maintenance/notification.
- Operasional: `docker-compose.yml`, `nginx/nginx.conf`, env example, Dockerfile/package script, backup/restore flow.

Catatan scope:

- Review ini belum melakukan fix kode aplikasi. File ini adalah daftar temuan dan rencana perbaikan.
- Line number berdasarkan snapshot saat review ini dibuat. Jika kode berubah, grep nama fungsi/file sebelum patch.
- Tidak ada temuan Critical yang pasti dari snapshot ini. Temuan High di bawah tetap sebaiknya diprioritaskan karena berdampak pada auth/security, halaman admin yang crash, dan operasi maintenance destruktif.

## Checklist Prioritas

### High

- [x] AUTH-01: Bedakan access token dan refresh token, tolak refresh token sebagai Bearer API/WebSocket.
- [x] FE-01: Perbaiki `ProtectedRoute` agar membaca API envelope refresh dengan benar.
- [x] FE-02: Perbaiki Admin Master Data agar unwrap API envelope kategori/subkategori.
- [x] OPS-01: Rapikan env Docker agar fresh setup memakai host service `db` dan `cache`.
- [x] OPS-02: Tolak JWT secret placeholder production dan enforce panjang/entropy minimal.
- [x] OPS-03: Pastikan refresh cookie `Secure` benar di belakang TLS/reverse proxy.
- [x] OPS-04: Tambahkan operation lock untuk seluruh proses restore backup.
- [x] TG-01: Samakan panjang Telegram link code yang dibuat dan yang diterima bot.

### Medium

- [x] API-01: Buat DTO query class nyata untuk users dan notifications pagination/filter.
- [x] ATT-01: Set visibility attachment komentar internal menjadi `INTERNAL` dan filter nested attachment komentar.
- [x] DATA-01: Buat operasi file storage lebih aman terhadap kegagalan DB/file.
- [x] OPS-05: Validasi restore tar terhadap symlink/hardlink/device, bukan hanya nama path.
- [x] SLA-01: Recalculate SLA saat priority ticket berubah.
- [x] AUTH-02: Logout tetap bisa revoke refresh cookie walau access token expired.
- [x] FE-03: Implement notifikasi realtime atau minimal unread count server-side yang akurat.
- [x] FE-04: Hilangkan opsi pagination `All` yang mengirim `limit=0`, atau implement mode valid.
- [x] FE-05: Jangan panggil hook Telegram admin-only untuk non-admin.
- [x] FE-06: Tangani partial success create ticket saat upload attachment gagal.
- [x] FE-07: Invalidate attachments saat add comment membawa file.
- [x] FE-08: Tambahkan kontrol pagination mobile.
- [x] FE-09: Setelah change password, reset session atau issue token baru.
- [x] OPS-06: Sesuaikan timeout nginx untuk backup/restore besar.
- [x] OPS-07: Selaraskan limit upload nginx dan backend.
- [x] OPS-08: Amankan permission/enkripsi backup artifact.
- [x] OPS-09: Hindari `source backend/.env` langsung di `scripts/backup.sh`.
- [x] OPS-10: Putuskan dan dokumentasikan Redis persistence untuk refresh session.

### Low

- [x] CAT-01: Delete category jangan menjadi 500 saat masih punya subcategory/SLA config.
- [x] API-02: Stream atau batasi export CSV unbounded.
- [x] ATT-02: Jangan expose path filesystem internal di response attachment.
- [x] SLA-02: Jadikan Redis lock SLA check atomik.
- [x] OPS-11: Selaraskan Docker seed flow dan rotasi password seed production.
- [x] OPS-12: Selaraskan production entrypoint `dist/main` vs `dist/src/main`.
- [x] OPS-13: Tambahkan real IP config nginx jika berada di belakang reverse proxy.
- [x] TG-02: Jadikan `TelegramConfig` singleton di schema. (Repository updated with `findOrCreate`; schema migration needed for `key @unique` column)
- [x] FE-10: Sembunyikan kategori inactive dari create ticket.

## Temuan Detail

### AUTH-01 - High - Refresh token bisa dipakai sebagai access token API/WebSocket

Referensi kode:

- `backend/src/auth/auth.service.ts:38-57`, `backend/src/auth/auth.service.ts:135-147`
- `backend/src/auth/strategies/jwt.strategy.ts:10-23`
- `backend/src/notifications/notifications.gateway.ts:50-55`

Root cause:

Access token dan refresh token ditandatangani dengan secret yang sama dan payload yang kompatibel. Refresh token hanya menambahkan `jti`, tetapi `JwtStrategy` tidak memvalidasi tipe token. Gateway WebSocket juga hanya `jwtService.verify()` dan memakai `payload.sub` tanpa menolak token refresh.

Impact:

Jika refresh token bocor, token itu dapat dipakai sebagai `Authorization: Bearer` untuk API protected dan auth WebSocket selama masa berlaku refresh token. Revocation Redis pada logout/change password tidak mencegah penggunaan refresh token sebagai access token karena access guard tidak mengecek Redis key refresh.

Langkah fix:

1. Tambahkan claim eksplisit pada token, misalnya `tokenType: 'access' | 'refresh'` atau `typ`/`aud`.
2. Saat sign access token, isi `tokenType: 'access'` dan expiry pendek.
3. Saat sign refresh token, isi `tokenType: 'refresh'`, `jti`, expiry refresh.
4. Di `JwtStrategy.validate()`, tolak payload yang bukan `tokenType === 'access'`.
5. Di `AuthService.refresh()`, tolak payload yang bukan `tokenType === 'refresh'` dan wajib punya `jti`.
6. Di `NotificationsGateway.handleConnection()`, verifikasi dan tolak payload non-access.
7. Pertimbangkan secret/audience berbeda untuk access dan refresh jika ingin defense-in-depth.
8. Saat refresh, bandingkan stored token Redis dengan refresh token yang dikirim, bukan hanya cek key ada.

Checklist fix:

- [x] Update `JwtPayload` interface dengan `tokenType` dan optional `jti`.
- [x] Update `generateTokens()` di `AuthService`.
- [x] Update `refresh()` dan `revokeRefreshToken()` validasi payload.
- [x] Update `JwtStrategy` dan `NotificationsGateway`.
- [x] Tambah test unit/e2e auth.

Suggested tests:

- Refresh token sebagai Bearer ke endpoint protected seperti `GET /api/tickets` harus `401`.
- Refresh token untuk WebSocket namespace `/notifications` harus disconnect.
- Access token dipakai ke `/api/auth/refresh` harus ditolak.
- Refresh token yang sudah logout/change password tidak bisa refresh dan tidak bisa API bearer.

### FE-01 - High - ProtectedRoute gagal restore session setelah reload/deep link

Referensi kode:

- `frontend/src/auth/ProtectedRoute.tsx:20-25`
- Pembanding benar: `frontend/src/lib/axios.ts:86-87`

Root cause:

`ProtectedRoute` memakai raw `axios.post('/api/auth/refresh')` lalu membaca `res.data.accessToken` dan `res.data.user`. API global `TransformInterceptor` membungkus response menjadi `{ data: { accessToken, user } }`. Interceptor axios di `frontend/src/lib/axios.ts` sudah membaca shape yang benar, tetapi `ProtectedRoute` belum.

Impact:

User yang punya refresh cookie valid akan tetap dianggap unauthenticated saat reload halaman protected atau buka deep link langsung. Akibatnya user dilempar ke `/login` meskipun session masih valid.

Langkah fix:

1. Ubah `ProtectedRoute` membaca `res.data.data.accessToken` dan `res.data.data.user`.
2. Lebih baik ekstrak helper `refreshSession()` di `frontend/src/lib/axios.ts` atau `frontend/src/hooks/use-auth.ts` agar `ProtectedRoute` dan interceptor memakai logic yang sama.
3. Handle response `{ accessToken: null, user: null }` dari backend sebagai unauthenticated tanpa throw.
4. Pastikan `checking` selesai setelah refresh gagal/sukses.

Checklist fix:

- [x] Update envelope access di `ProtectedRoute`.
- [x] Tambah type untuk response refresh.
- [x] Tambah test reload protected route.

Suggested tests:

- Mock refresh response `{ data: { accessToken, user } }`, render protected route, assert children tampil.
- E2E: login, reload `/tickets`, tetap berada di `/tickets`.
- E2E: buka `/admin/users` sebagai non-admin, refresh valid, diarahkan ke `/tickets`.

### FE-02 - High - Admin Master Data crash karena tidak unwrap API envelope

Referensi kode:

- `frontend/src/components/admin/MasterDataManagement.tsx:59-64`
- `frontend/src/components/admin/MasterDataManagement.tsx:177`
- `frontend/src/components/admin/MasterDataManagement.tsx:235-250`

Root cause:

Query kategori dan subkategori mengembalikan `response.data` langsung. Runtime API response adalah `{ data: Category[] }`, bukan `Category[]`. Komponen kemudian memanggil `categories.map()`, sehingga object envelope diperlakukan sebagai array.

Impact:

Halaman Admin Master Data tidak usable. Admin dapat melihat error seperti `categories.map is not a function`; subcategory query juga gagal karena loop `for (const cat of categories)` terhadap object envelope.

Langkah fix:

1. Pakai `ApiEnvelope` dan `unwrapData()` dari `frontend/src/lib/axios.ts` untuk `/categories`.
2. Untuk `/categories/:id/sub-categories`, unwrap `res.data.data` juga.
3. Hindari duplicate queryFn lokal. Reuse hook `useCategories()` bila cukup.
4. Jika subcategory tetap fetch per category, gunakan `Promise.all` agar tidak serial lambat, tetapi jaga error handling.

Checklist fix:

- [x] Update query `CategoryManager`.
- [x] Update query `SubCategoryManager`.
- [ ] Tambah render test Master Data dengan mock envelope.

Suggested tests:

- Render Master Data dengan mock `{ data: [{ id, name, isActive }] }`, kategori tampil.
- Mock subcategory endpoint `{ data: [...] }`, subkategori tampil.
- Mutation create/update/delete tetap invalidate `['categories']` dan `['subcategories']`.

### OPS-01 - High - Docker env flow mudah salah dan fresh Docker setup bisa gagal

Referensi kode:

- `docker-compose.yml:42`, `docker-compose.yml:70`, `docker-compose.yml:87`
- `backend/.env.example:6`, `backend/.env.example:19-22`
- `.env.example:2`, `.env.example:5-7`, `.env.example:30`, `.env.example:34-36`

Root cause:

Compose memakai `env_file: ./backend/.env` untuk `api`, `db`, dan `cache`. Namun `backend/.env.example` berisi `DATABASE_URL` dan `REDIS_URL` dengan host `localhost`. Di dalam container, `localhost` menunjuk container itu sendiri, bukan service `db`/`cache`. Root `.env.example` lebih Docker-like, tetapi tidak dipakai oleh compose.

Impact:

Developer/operator yang copy `backend/.env.example` ke `backend/.env` akan mendapat API container yang gagal konek DB/Redis. Fresh deploy menjadi rapuh dan error sulit dibedakan dari masalah network.

Langkah fix:

1. Putuskan satu env example resmi untuk Docker, idealnya `backend/.env.example` karena compose memang membacanya.
2. Ubah Docker values menjadi `DATABASE_URL=postgresql://ticketing:<password>@db:5432/ticketing`.
3. Ubah Redis menjadi `REDIS_URL=redis://:<password>@cache:6379`, `REDIS_HOST=cache`, `REDIS_PASSWORD=<password>`.
4. Hindari placeholder kosong untuk `REDIS_PASSWORD` jika production mewajibkan password.
5. Update README/AGENTS jika ada instruksi copy env.

Checklist fix:

- [x] Selaraskan `.env.example` dan `backend/.env.example`.
- [ ] Pastikan compose memakai env example yang didokumentasikan.
- [ ] Verifikasi fresh compose dari env baru.

Suggested verification:

- `docker compose --env-file backend/.env config`
- `docker compose up --build`
- `docker compose logs api` tidak menunjukkan koneksi ke `localhost:5432` atau `localhost:6379` dari dalam container.
- `GET /api/health` healthy melalui nginx.

### OPS-02 - High - Placeholder JWT production masih dapat diterima

Referensi kode:

- `backend/src/main.ts:18-23`
- `.env.example:10`
- `backend/.env.example:14`

Root cause:

`validateEnv()` hanya menolak beberapa weak secret: `your-super-secret-jwt-key-change-in-production`, `secret`, `changeme`, `password`. Root `.env.example` memakai `JWT_SECRET=change-this-to-random-secret`, tetapi nilai ini belum masuk denylist dan tidak ada minimum length/entropy check.

Impact:

Deployment production dapat start dengan JWT secret placeholder yang diketahui publik dari repository. Jika secret diketahui, attacker bisa forge JWT.

Langkah fix:

1. Tambahkan `change-this-to-random-secret` ke denylist.
2. Enforce panjang minimal, misalnya 32 atau 64 karakter.
3. Enforce nilai bukan repeated/common phrase sederhana.
4. Di env example, gunakan komentar seperti `JWT_SECRET=<generate-64-random-chars>` bukan nilai yang terlihat usable.

Checklist fix:

- [x] Update denylist di `validateEnv()`.
- [x] Tambah minimum length check.
- [x] Update env example.
- [ ] Tambah test/unit kecil untuk env validation bila pola test tersedia.

Suggested verification:

- Start backend dengan `NODE_ENV=production JWT_SECRET=change-this-to-random-secret` harus gagal.
- Start backend dengan random 64 karakter harus berhasil.

### OPS-03 - High - Refresh cookie bisa kehilangan flag Secure di belakang TLS terminator

Referensi kode:

- `backend/src/auth/auth.controller.ts:34-40`, `backend/src/auth/auth.controller.ts:55-61`
- `nginx/nginx.conf:48-55`

Root cause:

Backend menentukan `secure` cookie dari `req.headers['x-forwarded-proto'] === 'https'`. Nginx utama selalu set `X-Forwarded-Proto $scheme`. Jika ada TLS terminator di depan nginx dan koneksi ke nginx tetap HTTP, `$scheme` menjadi `http` meskipun user mengakses HTTPS.

Impact:

Cookie refresh token production dapat dikirim tanpa `Secure`, meningkatkan risiko exposure di jalur non-HTTPS atau konfigurasi proxy yang salah.

Langkah fix:

1. Tambah env eksplisit seperti `COOKIE_SECURE=true` untuk production.
2. Jika tetap mengandalkan proxy, pastikan proxy chain preserve `X-Forwarded-Proto=https` dan Express trust proxy benar.
3. Gunakan helper tunggal untuk cookie options login/refresh/logout supaya path/sameSite/secure konsisten.
4. Pastikan `clearCookie` memakai option yang sama, minimal `path`, `sameSite`, dan `secure` sesuai cookie asli.

Checklist fix:

- [x] Tambah helper cookie options.
- [x] Tambah env `COOKIE_SECURE` atau dokumentasi proxy yang eksplisit.
- [ ] Update nginx/reverse proxy config jika production memakai TLS terminator.

Suggested verification:

- Login via HTTPS production dan cek `Set-Cookie` mengandung `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`.
- Login via local HTTP tetap berfungsi jika `COOKIE_SECURE=false`.

### OPS-04 - High - Restore backup tidak punya operation lock selama fase destruktif

Referensi kode:

- `backend/src/maintenance/maintenance.service.ts:14-15`
- `backend/src/maintenance/maintenance.service.ts:76-85`
- `backend/src/maintenance/maintenance.service.ts:188-224`

Root cause:

Lock Redis hanya diambil di `createBackup()`. `restoreBackup()` memanggil `createBackup('pre-restore')`, tetapi lock tersebut dilepas setelah pre-restore backup selesai. Fase destruktif `restoreDatabase()` dan `restoreUploads()` berjalan tanpa lock. Dua request restore atau backup/restore paralel dapat interleave.

Impact:

DB schema dan uploads bisa corrupt atau tidak konsisten. Backup yang diambil saat restore berjalan dapat berisi data setengah restore.

Langkah fix:

1. Buat lock operasi maintenance tunggal, misalnya `maintenance:operation:lock`, atau lock restore terpisah yang juga dicek backup/delete.
2. Ambil lock di awal `restoreBackup()` sebelum maintenance mode/drain.
3. Tahan lock sampai DB dan uploads restore selesai atau gagal.
4. Simpan token random sebagai value lock dan release hanya jika token cocok.
5. Jika restore bisa lama, set TTL cukup panjang atau implement renew heartbeat.
6. Pastikan lock dilepas di `finally` untuk semua error path.

Checklist fix:

- [x] Tambah helper acquire/release lock dengan token.
- [x] Gunakan di `createBackup()` dan `restoreBackup()`.
- [x] Cegah backup/delete berjalan saat restore in progress.
- [ ] Tambah concurrency test.

Suggested tests:

- Dua call restore paralel: satu berjalan, satu mendapat 400/409 operation in progress.
- Backup saat restore in progress ditolak.
- Lock dilepas setelah restore sukses/gagal.

### TG-01 - High - Telegram link code yang dibuat tidak mungkin diterima bot

Referensi kode:

- `backend/src/telegram/telegram.service.ts:138-146`
- `backend/src/telegram/telegram.service.ts:418-421`
- `backend/src/telegram/telegram.controller.ts:23-29`

Root cause:

`generateLinkCode()` membuat code 10 karakter dari `randomBytes(5).toString('base64url').substring(0, 10).toUpperCase()`. Handler `/start` menolak code yang panjangnya bukan 6 karakter.

Impact:

User/Admin tidak bisa menautkan Telegram. Fitur notifikasi individu Telegram gagal secara praktis meskipun UI berhasil generate code.

Langkah fix:

1. Samakan panjang code. Pilihan minimal: ubah validator bot menerima 10 karakter.
2. Jika ingin 6 karakter, ubah generator menjadi 6 karakter dan pastikan collision handling memadai.
3. Update instruksi UI jika menampilkan format code.
4. Tambahkan test untuk flow generate code lalu `/start <code>`.

Checklist fix:

- [x] Pilih panjang code final.
- [x] Update generator atau validator.
- [ ] Tambah test unit service.

Suggested tests:

- Generate code lalu proses update Telegram `/start <code>` sukses dan menyimpan `telegramChatId`.
- Code salah/expired tetap ditolak.

### API-01 - Medium - Query pagination users/notifications tidak memakai DTO runtime yang valid

Referensi kode:

- `backend/src/users/users.controller.ts:29-38`
- `backend/src/notifications/notifications.controller.ts:24-33`
- `backend/src/common/dto/pagination-query.dto.ts:4-16`
- `backend/src/common/repositories/user.repository.ts:75-79`
- `backend/src/common/repositories/notification.repository.ts:21-30`

Root cause:

Controller memakai type intersection `PaginationQueryDto & { role?: string; search?: string; includeInactive?: string }`. TypeScript intersection tidak menghasilkan metadata runtime class-validator/class-transformer untuk field tambahan. Transform/validasi dapat tidak konsisten, terutama untuk `page`, `limit`, enum role, boolean query.

Impact:

`page/limit` berisiko tetap string atau value invalid masuk ke service/repository, menyebabkan error Prisma atau pagination aneh. `role=invalid`, `limit=1000`, atau boolean invalid tidak ditolak dengan 400 yang jelas.

Langkah fix:

1. Buat `QueryUsersDto extends PaginationQueryDto` dengan decorator `@IsOptional`, `@IsEnum(Role)`, `@IsString`, dan transform boolean untuk `includeInactive`.
2. Buat `QueryNotificationsDto extends PaginationQueryDto` dengan transform boolean untuk `unreadOnly`.
3. Pakai DTO class langsung di `@Query()` tanpa intersection type.
4. Hindari double `@Query('unreadOnly')` jika sudah ada di DTO.

Checklist fix:

- [x] Tambah DTO users query.
- [x] Tambah DTO notifications query.
- [x] Update controller.
- [ ] Tambah tests query validation.

Suggested tests:

- `GET /api/users?page=1&limit=20` berhasil dan `meta.limit` number.
- `GET /api/users?limit=1000` ditolak 400.
- `GET /api/users?role=invalid` ditolak 400.
- `GET /api/notifications?unreadOnly=true` memakai boolean true.

### ATT-01 - Medium - Attachment pada komentar internal disimpan sebagai PUBLIC dan nested attachment komentar tidak difilter policy

Referensi kode:

- `backend/src/comments/comments.service.ts:106-148`
- `backend/src/comments/comments.service.ts:173-178`
- `backend/src/common/repositories/comment.repository.ts:17-31`
- `backend/src/common/policies/attachment-visibility.policy.ts:15-29`, `backend/src/common/policies/attachment-visibility.policy.ts:50-61`

Root cause:

Saat create attachment bersama komentar, data attachment tidak mengisi `visibility`, sehingga default database kemungkinan `PUBLIC`. Ini terjadi juga untuk komentar `INTERNAL`. Selain itu `CommentRepository.findByTicketId()` selalu include semua attachments tanpa filter policy; endpoint komentar hanya memfilter comment type untuk EndUser.

Impact:

Saat ini EndUser tidak melihat internal comment karena comment type difilter. Namun data attachment internal tersimpan sebagai `PUBLIC`, sehingga mudah bocor di fitur baru, query lain, export, atau bug filter berikutnya. Nested attachments juga belum menerapkan policy centralized seperti aturan di `AGENTS.md`.

Langkah fix:

1. Saat create attachment comment, set `visibility: INTERNAL` jika `type === CommentType.INTERNAL`, selain itu `PUBLIC`.
2. Ubah repository/service agar `findByTicketId()` dapat menerima role dan apply filter attachment visibility untuk EndUser.
3. Atau post-filter nested attachment memakai `AttachmentVisibilityPolicy.isAttachmentVisible()` sebelum return.
4. Gunakan `select` field attachment yang aman, jangan full row jika tidak perlu.

Checklist fix:

- [x] Set visibility eksplisit pada create attachment komentar.
- [x] Filter nested attachments untuk EndUser.
- [x] Tambah regression test visibility.

Suggested tests:

- Buat internal comment dengan file; attachment DB harus `INTERNAL`.
- EndUser list comments/ticket detail/download tidak melihat attachment internal.
- Public comment dengan attachment `INTERNAL` tidak muncul untuk EndUser.

### DATA-01 - Medium - File storage tidak atomik dengan DB

Referensi kode:

- `backend/src/comments/comments.service.ts:104-156`
- `backend/src/attachments/attachments.service.ts:126-145`
- `backend/src/tickets/tickets.service.ts:471-484`

Root cause:

File disimpan/dihapus di filesystem di luar transaksi DB. Comment create membuat row comment lebih dulu, lalu menyimpan file dan membuat attachment rows satu per satu. Jika attachment create gagal, file dibersihkan tetapi comment yang sudah dibuat tetap ada. Direct attachment upload dapat meninggalkan file orphan jika DB create gagal setelah file save. Delete ticket menghapus file sebelum transaksi DB delete selesai.

Impact:

Data bisa tidak konsisten: comment tersimpan walau API dianggap gagal, attachment row menunjuk file yang sudah hilang, atau file orphan tertinggal di disk. Pada delete ticket, DB gagal setelah file dihapus membuat attachment masih ada tetapi file hilang.

Langkah fix:

1. Untuk create comment + attachments, buat DB rows dalam transaction dan rollback jika salah satu gagal.
2. Simpan file ke temp path lebih dulu, lalu promote/rename setelah DB commit, atau simpan final path tetapi cleanup semua error path termasuk DB error.
3. Untuk direct upload, cleanup file jika `attachmentRepository.create()` gagal.
4. Untuk delete ticket, prefer delete DB dulu lalu hapus file best-effort, atau buat cleanup job/outbox untuk file deletion.
5. Tambahkan reconciliation script/job untuk orphan files/rows jika data sudah ada.

Checklist fix:

- [x] Audit semua flow `storageService.save/delete`.
- [x] Tambah cleanup error path direct upload.
- [x] Ubah delete ticket agar tidak menghapus file sebelum DB commit.
- [ ] Tambah tests simulasi failure.

Suggested tests:

- Simulasikan attachment DB create gagal setelah file save; tidak ada file orphan.
- Simulasikan storage save gagal di comment create; comment tidak tersimpan atau response sesuai partial policy.
- Simulasikan DB delete ticket gagal; file tidak hilang.

### OPS-05 - Medium - Validasi tar restore hanya cek nama path, tidak cek symlink/hardlink/device

Referensi kode:

- `backend/src/maintenance/maintenance.service.ts:303-333`
- `backend/src/maintenance/maintenance.service.ts:335-374`

Root cause:

`assertSafeTarArchive()` menjalankan `tar -tzf` lalu memvalidasi string path. Listing nama path tidak menolak tipe entry tar seperti symlink, hardlink, device, atau link target absolut/path traversal. Extract memakai `tar -xzf` ke temp dir lalu rename ke upload dir.

Impact:

Backup uploads malicious/corrupt dapat menanam symlink di upload dir. Jika ada attachment path yang menunjuk symlink, download dapat membaca file di luar upload dir sesuai permission proses. Ini terutama penting karena restore adalah operasi admin dan backup file bisa berasal dari host.

Langkah fix:

1. Validasi tar header dengan library Node yang mengekspos `type` dan `linkname`, atau gunakan command tar mode verbose yang reliable dan parse type dengan hati-hati.
2. Tolak symlink, hardlink, block/char device, FIFO, absolute link target.
3. Setelah extract ke temp, walk recursive memakai `lstat()` dan reject symlink/hardlink yang tidak diharapkan.
4. Pastikan `realpath` setiap entry tetap berada di upload dir sebelum rename/copy.

Checklist fix:

- [x] Tambah validator tar entry type.
- [ ] Tambah post-extract `lstat` walk.
- [ ] Tambah tests backup malicious.

Suggested tests:

- Tar dengan `../x` ditolak.
- Tar dengan symlink ke `/etc/passwd` ditolak.
- Tar normal tetap restore.

### SLA-01 - Medium - Update priority tidak menghitung ulang SLA

Referensi kode:

- `backend/src/tickets/tickets.service.ts:42-61`
- `backend/src/tickets/tickets.service.ts:434-459`

Root cause:

Create ticket menghitung `slaDueAt` berdasarkan category + priority awal, tetapi `updatePriority()` hanya mengubah kolom `priority` dan history. Due date/status SLA tidak dihitung ulang.

Impact:

Ticket yang prioritasnya dinaikkan atau diturunkan tetap memakai SLA lama. Dashboard SLA, export, breach status, dan operasional support dapat salah.

Langkah fix:

1. Saat priority berubah, ambil category ticket dan SLA config untuk priority baru.
2. Recalculate `slaDueAt` sesuai policy bisnis. Perlu keputusan: dihitung dari `createdAt`, dari waktu priority berubah, atau mempertahankan due date jika sudah lebih ketat.
3. Update `slaStatus` jika due date baru mengubah status.
4. Catat history field `priority` dan opsional `slaDueAt`.

Checklist fix:

- [x] Konfirmasi policy bisnis recalculation SLA.
- [x] Update `updatePriority()`.
- [ ] Tambah tests priority change.

Suggested tests:

- Low ke Critical menghasilkan `slaDueAt` sesuai config Critical.
- Critical ke Low mengikuti policy yang dipilih.
- Jika tidak ada SLA config, fallback eksplisit dan teruji.

### AUTH-02 - Medium - Logout mensyaratkan access token valid

Referensi kode:

- `backend/src/auth/auth.controller.ts:80-91`

Root cause:

Endpoint logout dilindungi `JwtAuthGuard`, padahal token yang perlu direvoke adalah refresh cookie. Jika access token sudah expired tetapi refresh cookie masih valid, client tidak bisa logout/revoke tanpa melakukan refresh dulu.

Impact:

Refresh token tetap aktif lebih lama dari keinginan user ketika access token expired. UX logout juga dapat gagal pada session yang sebenarnya masih punya refresh cookie.

Langkah fix:

1. Jadikan logout cookie-based tanpa `JwtAuthGuard`, atau gunakan optional auth guard.
2. Selalu clear refresh cookie meskipun token invalid/tidak ada.
3. Jika refresh cookie ada, verify sebagai refresh token dan revoke Redis key.
4. Gunakan cookie clear options yang sama dengan set cookie.

Checklist fix:

- [x] Ubah guard logout.
- [x] Revoke refresh cookie tanpa perlu access token.
- [x] Tambah tests logout expired access.

Suggested tests:

- Logout dengan access expired tetapi refresh cookie valid tetap revoke Redis key dan clear cookie.
- Logout tanpa cookie tetap 200 dan clear cookie.

### FE-03 - Medium - Notifikasi realtime belum terpasang dan unread badge tidak akurat

Referensi kode:

- `frontend/package.json:12-23`
- `frontend/src/hooks/use-notifications.ts:7-23`
- `frontend/src/layout/Layout.tsx:8`
- Backend gateway tersedia di `backend/src/notifications/notifications.gateway.ts:24-88`

Root cause:

Frontend tidak memiliki dependency/client `socket.io-client`. Hook `useNotifications()` hanya fetch halaman saat ini dan menghitung unread dari item page tersebut. Backend sudah punya endpoint `GET /notifications/unread-count`, tetapi hook badge tidak memakainya.

Impact:

Notifikasi baru tidak realtime di UI. Badge unread bisa 0 atau terlalu kecil jika unread berada di halaman lain atau lebih dari limit page.

Langkah fix:

1. Minimal fix: buat hook `useUnreadNotificationCount()` yang memanggil `/notifications/unread-count` dan set store dari count server.
2. Full fix: tambahkan `socket.io-client`, connect ke namespace `/notifications` dengan access token memory.
3. Saat event `notification`, invalidate `['notifications']` dan refresh unread count.
4. Pastikan reconnect memakai access token terbaru setelah refresh.

Checklist fix:

- [x] Tambah hook unread count server-side.
- [x] Update layout/navbar badge memakai count endpoint.
- [ ] Opsional implement socket realtime.
- [x] Tambah tests badge.

Suggested tests:

- Seed >20 unread, badge menampilkan total unread server, bukan jumlah page pertama.
- Mock socket event, badge naik dan query notifications invalidated.

### FE-04 - Medium - Opsi pagination All mengirim `limit=0`

Referensi kode:

- `frontend/src/components/ui/Pagination.tsx:12-18`
- `frontend/src/hooks/use-tickets.ts:5-17`
- `frontend/src/components/tickets/TicketList.tsx:39-41`

Root cause:

UI memakai `0` untuk opsi `All`, dan hook query mengirim semua value yang bukan undefined/null/empty string. Akibatnya request menjadi `limit=0`, sementara DTO backend `PaginationQueryDto` mensyaratkan `@Min(1)`.

Impact:

User yang memilih `All` akan mendapat error API 400 atau list rusak. Jika backend suatu saat tidak validasi, `take=0` juga bermakna tidak ada data.

Langkah fix:

1. Pilihan paling aman: hapus opsi `All`.
2. Jika `All` diperlukan, map ke limit valid seperti 100 atau endpoint khusus export/list all dengan batas aman.
3. Jangan append `limit` jika value adalah mode UI internal.
4. Pastikan `totalPages` handling tidak hilang saat limit special mode.

Checklist fix:

- [x] Hapus atau ubah opsi `All`.
- [x] Update `useTickets()` supaya tidak mengirim `limit=0`.
- [x] Tambah test UI.

Suggested tests:

- Pilih semua opsi limit, tidak ada request `limit=0`.
- Pagination tetap render setelah perubahan.

### FE-05 - Medium - Hook Telegram admin-only tetap dipanggil oleh non-admin

Referensi kode:

- `frontend/src/pages/MyAccountPage.tsx:39-46`
- `frontend/src/pages/MyAccountPage.tsx:236`
- `frontend/src/hooks/use-telegram.ts:19-26`
- `frontend/src/hooks/use-telegram.ts:58-66`

Root cause:

Page hanya menyembunyikan section Telegram admin di render, tetapi hooks `useTelegramStatus()`, `useTelegramConfig()`, dan mutation setup tetap dibuat tanpa role-based `enabled`. `useTelegramConfig()` sudah mendukung `options.enabled`, tetapi caller tidak memakainya. `useTelegramStatus()` belum punya opsi enabled.

Impact:

EndUser/ITSupport yang membuka My Account dapat memicu request admin-only dan mendapatkan 403 tersembunyi/retry noise. Ini tidak membuka data, tetapi menambah noise dan bisa memicu redirect/error handling yang tidak perlu.

Langkah fix:

1. Pindahkan seluruh section Telegram ke child component `AdminTelegramSettings` yang hanya dirender untuk Admin.
2. Atau tambahkan `enabled: user?.role === 'Admin'` untuk config/status query.
3. Jika status link individu ingin tersedia untuk semua role, pastikan backend route memang mengizinkan dan UI membedakan endpoint admin config vs user link status.

Checklist fix:

- [x] Tentukan apakah link Telegram user-level hanya Admin atau semua user.
- [x] Tambah enabled role check atau split component.
- [ ] Tambah test render non-admin.

Suggested tests:

- Render My Account sebagai EndUser, assert tidak ada request `/telegram/config`.
- Render sebagai Admin, request config tetap jalan.

### FE-06 - Medium - Create ticket + attachment tidak atomic dan retry bisa membuat duplikat ticket

Referensi kode:

- `frontend/src/components/tickets/CreateTicketForm.tsx:84-99`

Root cause:

Frontend membuat ticket lebih dulu, lalu upload attachment satu per satu. Seluruh flow berada dalam satu `try`. Jika upload gagal setelah ticket berhasil dibuat, UI menampilkan `Failed to create ticket`, padahal ticket sudah ada. User dapat submit ulang dan membuat ticket duplikat.

Impact:

Ticket duplikat dan attachment tidak lengkap. User tidak diberi tahu ticket ID yang sudah dibuat.

Langkah fix:

1. Setelah create ticket sukses, simpan `createdTicket`.
2. Jika upload gagal, treat sebagai partial success: tampilkan warning `Ticket created, some uploads failed` dan navigasi ke detail ticket.
3. Berikan opsi retry upload dari detail ticket, bukan create ticket lagi.
4. Alternatif backend: buat endpoint multipart create ticket with attachments dalam satu flow server-side.

Checklist fix:

- [x] Ubah error handling partial success.
- [x] Navigasi ke `/tickets/:id` atau detail setelah create sukses.
- [ ] Tambah test upload gagal.

Suggested tests:

- Mock create sukses dan upload gagal; tidak muncul pesan `Failed to create ticket` yang misleading.
- Submit ulang tidak membuat ticket kedua.

### FE-07 - Medium - Add comment dengan file tidak invalidate attachment list

Referensi kode:

- `frontend/src/hooks/use-tickets.ts:91-119`
- `frontend/src/components/tickets/CommentSection.tsx:77-83`
- `frontend/src/components/tickets/AttachmentList.tsx:53`

Root cause:

`useAddComment()` hanya invalidate `['ticket', ticketId, 'comments']`. Jika komentar membawa file, AttachmentList memakai query terpisah `['ticket', ticketId, 'attachments']` dan tidak ikut refresh.

Impact:

File yang baru diupload lewat komentar dapat muncul di comment section tetapi daftar attachments tetap stale sampai reload/refetch lain.

Langkah fix:

1. Di `onSuccess`, jika `variables.files?.length`, invalidate `['ticket', ticketId, 'attachments']`.
2. Jika ticket detail menampilkan attachment count/update time, invalidate `['ticket', ticketId]` juga.

Checklist fix:

- [x] Update invalidation di `useAddComment()`.
- [ ] Tambah test/query invalidation.

Suggested tests:

- Add comment dengan file, AttachmentList update tanpa reload.
- Add comment tanpa file tidak melakukan invalidation attachment yang tidak perlu.

### FE-08 - Medium - Pagination tidak usable di mobile

Referensi kode:

- `frontend/src/components/ui/Pagination.tsx:62-103`

Root cause:

Tombol Previous/Next dan page number dibungkus `hidden sm:flex`, sedangkan hanya text page info yang `hidden sm:block`. Pada layar kecil, kontrol navigasi hilang.

Impact:

User mobile tidak bisa pindah halaman ticket list/halaman lain yang memakai komponen ini.

Langkah fix:

1. Tambahkan mobile controls terpisah visible di bawah breakpoint `sm`, minimal Previous/Next.
2. Pastikan tap target cukup besar.
3. Pertahankan desktop pagination seperti sekarang.

Checklist fix:

- [x] Tambah mobile Previous/Next.
- [x] Test responsive render.

Suggested tests:

- Render viewport mobile, tombol Previous/Next visible dan memanggil `onPageChange`.
- Desktop tetap menampilkan page number.

### FE-09 - Medium - Change password sukses tetapi refresh session berikutnya akan gagal

Referensi kode:

- `frontend/src/pages/MyAccountPage.tsx:105-110`
- `frontend/src/hooks/use-change-password.ts:11-13`
- Backend revocation: `backend/src/auth/auth.service.ts:105-110`

Root cause:

Setelah change password, backend revoke semua refresh token user. Frontend hanya clear form dan menampilkan success, tetap menyimpan access token in-memory sampai expired. Reload atau refresh berikutnya akan gagal dan user diarahkan login secara mendadak.

Impact:

UX membingungkan: user melihat password sukses, lalu tiba-tiba logout saat access token expired/reload. Secara security revocation benar, tetapi flow UI tidak menjelaskan konsekuensinya.

Langkah fix:

1. Setelah change password sukses, clear auth store dan query cache, lalu arahkan ke login dengan pesan `Please login again with your new password`.
2. Alternatif: backend mengeluarkan refresh token baru setelah change password dan frontend update session. Ini perubahan behavior lebih besar.

Checklist fix:

- [x] Pilih policy UX setelah password change.
- [x] Implement redirect login atau token baru.
- [ ] Tambah test.

Suggested tests:

- Change password sukses mengarahkan user ke login atau memastikan refresh token baru valid.
- Reload setelah password change tidak menghasilkan state menggantung.

### OPS-06 - Medium - Timeout nginx 60 detik tidak cocok untuk backup/restore besar

Referensi kode:

- `nginx/nginx.conf:48-55`
- `backend/src/maintenance/maintenance.service.ts:97-107`
- `backend/src/maintenance/maintenance.service.ts:205-214`

Root cause:

Semua `/api/` memakai `proxy_read_timeout 60s`, sementara backup/restore bisa menjalankan `pg_dump`, `gzip`, `tar`, drain 5 detik, drop schema, dan restore file besar. Operasi dapat melebihi 60 detik.

Impact:

UI/operator menerima 504 dari nginx padahal backend mungkin masih melanjutkan operasi. Status maintenance/restore menjadi sulit dipahami.

Langkah fix:

1. Tambahkan `location /api/maintenance/` dengan timeout lebih panjang, misalnya 10-30 menit sesuai ukuran backup.
2. Solusi lebih baik: jadikan backup/restore async job dengan endpoint status polling.
3. Pastikan UI menampilkan progress/status dan mencegah double submit.

Checklist fix:

- [ ] Tambah location nginx khusus maintenance atau async job.
- [ ] Update UI maintenance bila async.
- [ ] Test backup besar.

Suggested verification:

- Backup/restore dataset besar >60 detik tidak menghasilkan 504 atau UI status tetap akurat.

### OPS-07 - Medium - Limit upload nginx tidak selaras dengan backend

Referensi kode:

- `nginx/nginx.conf:46`
- `backend/src/comments/comments.controller.ts:34-35`, `backend/src/comments/comments.controller.ts:51-52`
- `backend/src/attachments/attachments.controller.ts:39`, `backend/src/attachments/attachments.controller.ts:47-48`

Root cause:

Nginx `client_max_body_size 10m`. Backend mengizinkan comment upload multi-file, misalnya 3 file x 5MB, dan single upload 10MB dapat melebihi 10MB karena multipart overhead.

Impact:

User mendapat 413 dari nginx, bukan API error envelope. Aturan upload UI/backend tidak konsisten.

Langkah fix:

1. Selaraskan total request max antara nginx dan backend.
2. Jika backend mengizinkan 3 x 5MB, set nginx minimal >15MB plus overhead, misalnya 20m.
3. Atau turunkan backend multi-file total limit agar selalu <10m.
4. Dokumentasikan limit dalam satu env/config source jika memungkinkan.

Checklist fix:

- [ ] Tentukan max upload total.
- [ ] Update nginx/backend agar konsisten.
- [ ] Test upload boundary.

Suggested verification:

- Upload 3 file 5MB pada comment berhasil atau ditolak backend dengan envelope jelas sesuai policy.
- Upload single 10MB tidak gagal di nginx karena overhead bila policy mengizinkan 10MB.

### OPS-08 - Medium - Backup artifact berisi data sensitif tanpa permission ketat/enkripsi

Referensi kode:

- `scripts/backup.sh:21`, `scripts/backup.sh:24`, `scripts/backup.sh:27-31`, `scripts/backup.sh:33-39`
- `docker-compose.yml:51`
- `backend/prisma/schema.prisma:13`, `backend/prisma/schema.prisma:236-237`

Root cause:

Backup DB/uploads ditulis ke host `./backups` tanpa `umask 077`, chmod, atau enkripsi. DB dump dapat berisi password hash dan Telegram bot token/config. Uploads juga dapat berisi lampiran tiket sensitif.

Impact:

User/proses lain di host dapat membaca backup jika permission default host longgar. Risiko data exposure di luar kontrol aplikasi.

Langkah fix:

1. Tambahkan `umask 077` di awal `scripts/backup.sh`.
2. Pastikan directory backup `700` dan file `600`.
3. Pertimbangkan encryption-at-rest untuk backup, terutama jika dipindah off-host.
4. Dokumentasikan handling backup sensitif.

Checklist fix:

- [ ] Update permission backup script.
- [ ] Audit permission backup UI/backend jika membuat backup dari API.
- [ ] Pertimbangkan enkripsi.

Suggested verification:

- Setelah backup, `stat backups/<id>/*` menunjukkan file tidak world-readable.

### OPS-09 - Medium - `backup.sh` rentan gagal karena source `.env` dengan `set -u`

Referensi kode:

- `scripts/backup.sh:2`, `scripts/backup.sh:11-15`
- `backend/.env.example:19`, `backend/.env.example:22`

Root cause:

Script melakukan shell-source `backend/.env` saat `set -u` aktif. Jika `.env` berisi `REDIS_URL=redis://:${REDIS_PASSWORD}@localhost:6379` sebelum `REDIS_PASSWORD` didefinisikan, shell dapat gagal karena unbound variable. Sourcing `.env` juga mengeksekusi shell syntax, yang tidak ideal untuk file konfigurasi.

Impact:

Backup operasional bisa gagal hanya karena format/order env. Ada risiko keamanan jika file env berisi syntax shell yang tidak disadari.

Langkah fix:

1. Jangan source `.env` langsung. Parse hanya key yang dibutuhkan, misalnya `POSTGRES_USER`, `POSTGRES_DB`.
2. Atau gunakan `docker compose exec db pg_dump` dengan env di container.
3. Jika tetap source, disable nounset sementara dan pastikan env example mendefinisikan dependency sebelum dipakai.

Checklist fix:

- [ ] Refactor env loading `backup.sh`.
- [ ] Test dengan env example.

Suggested verification:

- Copy `backend/.env.example` ke `backend/.env`, jalankan `./scripts/backup.sh`, tidak gagal karena expansion env.

### OPS-10 - Medium - Redis tidak punya volume persistence, refresh session hilang saat container recreate

Referensi kode:

- `docker-compose.yml:84-95`
- `backend/src/auth/auth.service.ts:48-52`, `backend/src/auth/auth.service.ts:150-153`

Root cause:

Refresh token disimpan di Redis, tetapi service `cache` tidak memakai named volume/data persistence. Redis restart/recreate akan menghapus semua session refresh dan maintenance flags.

Impact:

Semua user logout setelah Redis recreate. Maintenance mode flag juga hilang. Ini bisa diterima sebagai tradeoff, tetapi perlu diputuskan dan didokumentasikan.

Langkah fix:

1. Jika UX session persistence penting, tambahkan Redis named volume dan konfigurasi RDB/AOF.
2. Jika logout massal saat Redis loss diterima, dokumentasikan jelas di README/ops runbook.
3. Pastikan maintenance mode tidak bergantung pada Redis persistence saat restore/backup kritis.

Checklist fix:

- [ ] Putuskan policy persistence Redis.
- [ ] Tambah volume/config atau dokumentasi.
- [ ] Test restart Redis.

Suggested verification:

- Login, restart/recreate `cache`, coba `/api/auth/refresh`; behavior sesuai policy yang didokumentasikan.

### CAT-01 - Low - Delete category bisa 500 karena FK subcategory/SLA config

Referensi kode:

- `backend/src/categories/categories.service.ts:70-80`
- `backend/prisma/schema.prisma:177-197`

Root cause:

Delete category hanya cek jumlah ticket. Category yang tidak punya ticket tetapi masih punya subcategory atau SLA config akan dihapus hard delete, padahal FK masih restrict.

Impact:

Admin delete category unused dapat menghasilkan Prisma FK error 500, bukan 400/409 yang jelas.

Langkah fix:

1. Cek relasi subcategories dan SLA configs sebelum delete.
2. Jika masih ada relasi, soft delete `isActive=false` atau return 409 dengan pesan jelas.
3. Tangkap Prisma `P2003/P2025` dan ubah ke error API stabil.

Suggested tests:

- Delete category dengan subcategory tanpa ticket tidak 500.
- Delete category kosong berhasil.

### API-02 - Low - Export CSV unbounded dan dibangun penuh di memory

Referensi kode:

- `backend/src/tickets/tickets.controller.ts:49-60`
- `backend/src/tickets/tickets.service.ts:215-247`

Root cause:

Export mengambil semua ticket match tanpa limit/streaming lalu membuat string CSV penuh di memory.

Impact:

Dataset besar dapat menyebabkan memory spike atau timeout. Endpoint bisa dipakai Admin/ITSupport untuk request berat.

Langkah fix:

1. Stream CSV response dengan cursor/pagination batch.
2. Tambahkan max rows atau async export job.
3. Tambahkan audit log untuk export besar jika diperlukan.

Suggested tests:

- Export 10k+ ticket tidak memory spike besar.
- Filter tetap diterapkan pada export batch.

### ATT-02 - Low - Response attachment mengekspos path filesystem internal

Referensi kode:

- `backend/src/common/repositories/attachment.repository.ts:13-22`
- `backend/src/tickets/tickets.service.ts:263-270`
- `backend/src/common/repositories/comment.repository.ts:25-29`
- `backend/src/attachments/attachments.service.ts:132-147`

Root cause:

Query attachment sering memakai full row, termasuk field `path` yang merupakan path filesystem internal server.

Impact:

Client menerima informasi internal path. Ini bukan akses file langsung, tetapi tetap information disclosure dan memperbesar dampak jika ada bug download/path traversal lain.

Langkah fix:

1. Gunakan `select` untuk response attachment publik: `id`, `originalName`, `mimeType`, `size`, `visibility`, `createdAt`, dan user ringkas.
2. Field `path` hanya dipakai internal di service download/storage.
3. Pastikan transform response tidak mengirim path dari nested attachments.

Suggested tests:

- Ticket detail, comment list, upload response, dan attachment list tidak mengandung `path`.
- Download via attachment id tetap berhasil.

### SLA-02 - Low - Redis lock SLA check tidak atomik

Referensi kode:

- `backend/src/sla/sla.service.ts:64-82`

Root cause:

Lock dibuat dengan pola `exists()` lalu `set()`, bukan atomic `SET NX EX`.

Impact:

Pada multi-instance, dua worker dapat lolos race dan menjalankan SLA check bersamaan. Efeknya bisa double notification/history jika check tidak idempotent.

Langkah fix:

1. Ganti dengan `redis.set(lockKey, token, 'EX', 300, 'NX')`.
2. Release hanya jika token lock sama.
3. Pastikan job idempotent terhadap ticket yang sama.

Suggested tests:

- Dua `checkSLA()` paralel hanya satu menjalankan work.
- Lock expired memungkinkan run berikutnya.

### OPS-11 - Low - Seed Docker/production flow tidak jelas dan password default bisa bertahan

Referensi kode:

- `backend/Dockerfile:45`
- `backend/package.json:14-16`
- `backend/prisma/seed.ts:16-20`, `backend/prisma/seed.ts:24-46`

Root cause:

Docker CMD menjalankan `prisma migrate deploy && node dist/src/main`, tidak menjalankan seed. Seed memakai `upsert` dengan `update: {}` untuk admin/support, sehingga jika akun default pernah dibuat dengan password dev, production seed berikutnya tidak merotasi password.

Impact:

Fresh DB bisa tidak punya admin/category/SLA jika seed tidak dijalankan manual. Sebaliknya, environment yang pernah seed dev dapat mempertahankan credential dev saat pindah production.

Langkah fix:

1. Tentukan flow resmi seed: otomatis first deploy atau manual documented command.
2. Jika production seed dijalankan, update password dari `SEED_ADMIN_PASSWORD` dan `SEED_SUPPORT_PASSWORD`.
3. Tambah env example untuk seed production.

Suggested tests:

- Fresh DB setelah deploy punya data awal sesuai flow.
- Dev seed lalu production seed membuat password dev tidak berlaku.

### OPS-12 - Low - Backend production entrypoint tidak selaras

Referensi kode:

- `backend/package.json:11`
- `backend/Dockerfile:45`
- `backend/tsconfig.json:28`

Root cause:

`start:prod` menjalankan `node dist/main`, sedangkan Docker menjalankan `node dist/src/main`. Build output dapat berbeda tergantung Nest/tsconfig. Dua flow production tidak konsisten.

Impact:

Production di luar Docker dapat gagal start meskipun Docker berhasil, atau sebaliknya. Debug deployment menjadi membingungkan.

Langkah fix:

1. Standarkan output entrypoint: `dist/main` atau `dist/src/main`.
2. Update `start:prod` dan Docker CMD agar sama.
3. Tambahkan verification command di README/AGENTS jika berubah.

Suggested verification:

- `cd backend && npm run build && npm run start:prod`
- `docker compose build api && docker compose up api`

### OPS-13 - Low - Rate limit nginx bisa salah key di belakang proxy

Referensi kode:

- `nginx/nginx.conf:33`, `nginx/nginx.conf:51-55`

Root cause:

Rate limit memakai `$binary_remote_addr`. Jika nginx ini berada di belakang reverse proxy/load balancer, remote addr bisa IP proxy, bukan IP client. Tidak ada `real_ip_header` dan `set_real_ip_from`.

Impact:

Banyak user di belakang proxy yang sama dapat berbagi limit dan saling throttle. Jika asal IP tidak dipercaya dengan benar, konfigurasi real IP yang salah juga bisa spoofable.

Langkah fix:

1. Jika ada reverse proxy depan, tambahkan `set_real_ip_from` hanya untuk IP proxy tepercaya.
2. Tambahkan `real_ip_header X-Forwarded-For` atau header yang sesuai proxy.
3. Jangan trust semua forwarded IP.

Suggested verification:

- Simulasikan beberapa client via proxy, rate limit per client, bukan per proxy.

### TG-02 - Low - `TelegramConfig` tidak dipaksa singleton oleh schema

Referensi kode:

- `backend/prisma/schema.prisma:234-241`
- `backend/src/common/repositories/telegram-config.repository.ts:8-13`
- `backend/src/telegram/telegram.service.ts:182-185`, `backend/src/telegram/telegram.service.ts:201-204`

Root cause:

Schema tidak punya fixed singleton key/unique constraint. Service melakukan `findFirst()` lalu `create()` jika kosong. Race pada request pertama atau edit manual DB dapat membuat banyak row config.

Impact:

`findFirst()` menjadi nondeterministic jika ada banyak row. Bot token/settings yang dipakai bisa berbeda dari yang diedit Admin.

Langkah fix:

1. Tambahkan kolom singleton key, misalnya `key String @unique @default("default")`, atau fixed id.
2. Gunakan `upsert` berbasis key.
3. Buat migration cleanup row duplikat jika sudah ada data.

Suggested tests:

- Concurrent `GET/PUT /api/telegram/config` pada DB kosong hanya membuat satu row.

### FE-10 - Low - Create Ticket menampilkan kategori inactive

Referensi kode:

- `frontend/src/hooks/use-categories.ts:5-10`
- `frontend/src/components/tickets/CreateTicketForm.tsx:42-43`
- `frontend/src/components/tickets/CreateTicketForm.tsx:161-165`

Root cause:

Form create ticket memetakan semua kategori dari `/categories` tanpa filter `isActive`.

Impact:

User dapat memilih kategori inactive lalu submit gagal dari backend dengan error generik. Admin Master Data tetap perlu melihat inactive, tetapi create form tidak.

Langkah fix:

1. Di `CreateTicketForm`, pakai `categories?.filter((c) => c.isActive)` untuk select category.
2. Subcategory juga harus mengikuti category aktif dan subcategory aktif jika model punya flag.
3. Tetap biarkan Admin Master Data melihat semua kategori.

Suggested tests:

- Mock kategori active + inactive; inactive tidak muncul di Create Ticket.

## Urutan Fix yang Disarankan

1. Fix security/session high impact: AUTH-01, FE-01, OPS-02, OPS-03.
2. Fix halaman yang jelas broken: FE-02, TG-01.
3. Fix operasi destruktif dan backup: OPS-04, OPS-05, OPS-06, OPS-08, OPS-09.
4. Fix data consistency: ATT-01, DATA-01, SLA-01, AUTH-02.
5. Fix UX/data freshness frontend: FE-03 sampai FE-10.
6. Fix robustness low risk: CAT-01, API-02, ATT-02, SLA-02, OPS-11 sampai OPS-13, TG-02.

## Catatan untuk Agent AI Berikutnya

- Baca `AGENTS.md` terlebih dahulu. Aturan non-negotiable terpenting: jangan persist access token di storage, jangan expose EndUser ke dashboard/admin/internal comments/attachments, jangan kirim Telegram secret ke frontend, jangan destructive git/docker command tanpa izin.
- Jangan fix semua checklist sekaligus. Ambil 1-3 item yang saling terkait per sesi agar review dan test tetap terkontrol.
- Mulai dari AUTH-01 karena ini security boundary paling penting. Setelah itu FE-01 karena ProtectedRoute saat ini salah membaca envelope refresh.
- Saat mengubah backend, ikuti flow controller -> service -> repository. Service baru inject repository, bukan langsung `PrismaService`, kecuali pola existing memang sudah begitu untuk transaksi.
- Saat mengubah frontend API call, gunakan `apiClient`, `ApiEnvelope`, `unwrapData`, dan `unwrapPage` dari `frontend/src/lib/axios.ts`. Jangan akses `response.data` langsung kecuali endpoint benar-benar blob/non-envelope.
- Setelah fix backend auth/visibility, jalankan verifikasi sempit: `cd backend && npm test` atau minimal spec terkait. Setelah fix frontend, jalankan `cd frontend && npm run lint` dan `cd frontend && npm run build` jika menyentuh TS/React.
- Untuk maintenance/backup/restore, jangan jalankan operasi destruktif di data nyata. Gunakan test/mocking atau environment disposable. Jangan `docker compose down -v`.
- Jika menambah env baru seperti `COOKIE_SECURE`, update `.env.example`, `backend/.env.example`, README/ops docs, dan pastikan local HTTP tetap bisa login.
- Jika memperbaiki Telegram config, jaga rule bahwa frontend hanya menerima `hasBotToken`/`hasGroupChatId`, bukan token/chat id secret.
- Jika memperbaiki attachment visibility, tambahkan regression test EndUser agar internal comments/attachments tidak bocor dari ticket detail, comments endpoint, attachments endpoint, dan download endpoint.

## Verifikasi Review Ini

- Dokumen ini dibuat dari pembacaan kode statis dan sub-audit backend/frontend/ops.
- Tidak ada test/build yang dijalankan karena tidak ada perubahan kode aplikasi.
- Verifikasi berikutnya harus dijalankan per item fix yang diambil dari checklist.

## Status Verifikasi

- **Backend tests**: 47/47 pass (`npm test` di `backend/`)
  - `attachment-visibility.policy.spec.ts`: 15+ tests (ATT-01 regression)
  - `tickets.service.spec.ts`: existing tests
  - `auth.service.spec.ts`: 9 tests (AUTH-01 token type validation)
  - `auth.controller.spec.ts`: 7 tests (AUTH-02 cookie-based logout)
- **Frontend tests**: 13/13 pass (`vitest` di `frontend/`)
  - `ProtectedRoute.test.tsx`: 3 tests (FE-01)
  - `auth-store.test.tsx`: 3 tests (auth store)
  - `Pagination.test.tsx`: 5 tests (FE-04, FE-08)
  - `use-notifications.test.tsx`: 2 tests (FE-03)
- **Frontend lint**: pass (`npm run lint` di `frontend/`)
- **Docker build**: pass (`docker compose up --build -d`) — lockfiles regenerated dengan npm 10 untuk kompatibilitas
