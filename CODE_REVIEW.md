# Code Review - Bug & Edge Case

Tanggal review: 2026-06-26  
Reviewer: AI senior fullstack engineer  
Scope: backend NestJS, frontend React, Docker/nginx/env, backup/restore, auth/session, upload/download, notification, Telegram, maintenance mode.  
Fokus utama: bug, edge case, data leak, race condition, operational failure, dan mismatch kontrak API/frontend.

## Ringkasan Prioritas

- [ ] P0-01: Restore backup membuka maintenance mode walaupun restore gagal.
- [ ] P0-02: Setup Docker fresh install bisa gagal karena template env tidak konsisten dan `REDIS_PASSWORD` production wajib tapi tidak tersedia di root template.
- [ ] P1-01: EndUser bisa menginfer internal attachment dari meta pagination dan public attachment bisa terskip.
- [ ] P1-02: WebSocket frontend tetap memakai access token lama setelah refresh.
- [ ] P1-03: Direct attachment upload/comment attachment tidak atomic dan bisa meninggalkan orphan file/row.
- [ ] P1-04: Status transition ticket race-prone.
- [ ] P1-05: Deaktivasi user tidak revoke sesi aktif dan tidak disconnect WebSocket.
- [ ] P1-06: Read endpoint master data/SLA mengekspos count dan SLA config ke EndUser.
- [ ] P1-07: Telegram polling restart bisa membuat multiple polling loop.
- [ ] P1-08: Manual backup script bisa membuat backup inconsistent jika dijalankan saat aplikasi live.
- [ ] P2-01: Query pagination comment/attachment tidak tervalidasi.
- [ ] P2-02: Telegram config/check body tidak tervalidasi DTO.
- [ ] P2-03: SLA create/update membocorkan Prisma edge error sebagai 500.
- [ ] P2-04: Frontend mutation/export/download failure banyak yang silent.
- [ ] P2-05: Pagination frontend tidak clamp saat total pages menyusut.
- [ ] P2-06: `VITE_API_URL` didokumentasikan tapi tidak dipakai frontend.
- [ ] P2-07: Redis password leak lewat command/process args.
- [ ] P2-08: nginx real IP trust terlalu luas untuk private network.
- [ ] P3-01: Login redirect mengabaikan intended route.
- [ ] P3-02: Notification unread count bisa drift saat repeated mark-read.
- [ ] P3-03: Telegram assignment notification kehilangan subject.
- [ ] P3-04: Object URL thumbnail tidak pernah direvoke.
- [ ] P3-05: DTO kategori/user menerima string kosong/whitespace.

## Temuan Detail

### P0-01 - Restore failure tetap disable maintenance mode

Severity: Critical  
Area: Backend maintenance/restore  
Referensi: `backend/src/maintenance/maintenance.service.ts:234-250`

Root cause:
- `restoreBackup()` mengaktifkan maintenance, membuat pre-restore backup, restore DB, restore uploads.
- Pada `catch`, service selalu memanggil `setMaintenanceMode(false)`.
- Ini bertentangan dengan catatan project bahwa maintenance hanya dimatikan jika restore sukses.

Dampak:
- Jika `restoreDatabase()` sudah drop schema atau restore sebagian lalu `restoreUploads()` gagal, aplikasi langsung dibuka ke user dalam kondisi data rusak/tidak konsisten.
- Operator kehilangan safety window untuk recover memakai pre-restore backup.

Checklist fix:
- [ ] Ubah flow agar maintenance hanya dimatikan setelah `restoreDatabase()` dan `restoreUploads()` sukses.
- [ ] Pada failure, biarkan maintenance tetap enabled dengan pesan eksplisit, misalnya `Restore gagal. Sistem ditahan dalam maintenance. Gunakan pre-restore backup untuk recovery.`
- [ ] Simpan/return ID pre-restore backup bila sudah berhasil dibuat sebelum error.
- [ ] Pastikan `finally` hanya release lock, bukan mengubah maintenance.
- [ ] Tambahkan test unit untuk kasus `restoreDatabase` sukses lalu `restoreUploads` gagal.
- [ ] Tambahkan test unit untuk kasus `createBackup('pre-restore')` gagal sebelum destructive restore.

Verifikasi yang disarankan:
- [ ] `cd backend && npm test -- maintenance`
- [ ] Manual: mock/trigger restore upload failure dan cek `GET /api/health` tetap `maintenance.enabled=true`.

---

### P0-02 - Fresh Docker setup bisa gagal karena env template mismatch

Severity: Critical  
Area: Deployment/env/Docker  
Referensi: `README.md:213-221`, `.env.example:1-39`, `backend/.env.example:23-29`, `docker-compose.yml:42,87-90`, `backend/src/main.ts:18-41`

Root cause:
- README meminta `cp .env.example backend/.env`.
- Root `.env.example` memakai `NODE_ENV=production`, berisi `REDIS_URL=redis://cache:6379`, tetapi tidak berisi `REDIS_PASSWORD`.
- Backend production startup mewajibkan `REDIS_PASSWORD`.
- Redis container dijalankan dengan `redis-server --requirepass "$REDIS_PASSWORD"`, sehingga env kosong bisa membuat auth/config tidak sesuai ekspektasi.
- `backend/.env.example` malah default `DATABASE_URL` dan `REDIS_URL` ke `localhost`, yang salah untuk Docker Compose bila dipakai langsung.

Dampak:
- Fresh `docker compose up --build` dari README bisa gagal startup atau menghasilkan error Redis/database yang membingungkan.
- Onboarding/operator bisa salah memilih template env.

Checklist fix:
- [ ] Buat satu template canonical untuk Docker Compose, misalnya `backend/.env.compose.example`.
- [ ] Tambahkan `REDIS_PASSWORD=<replace-me>` di template Docker.
- [ ] Gunakan URL Docker-safe: `DATABASE_URL=postgresql://ticketing:<password>@db:5432/ticketing` dan `REDIS_URL=redis://:<redis-password>@cache:6379`.
- [ ] Pisahkan template local dev, misalnya `backend/.env.local.example`, untuk host `localhost`.
- [ ] Update README agar tidak menyalin root `.env.example` jika compose membaca `backend/.env`.
- [ ] Validasi `REDIS_PASSWORD` juga di Redis healthcheck memakai env yang sama.

Verifikasi yang disarankan:
- [ ] Dari clone bersih, copy template baru ke `backend/.env`, isi secret, jalankan `docker compose config`.
- [ ] `docker compose up --build` sampai API healthcheck healthy.

---

### P1-01 - EndUser attachment list leak internal count dan pagination salah

Severity: High  
Area: Backend authorization/data visibility  
Referensi: `backend/src/attachments/attachments.service.ts:176-202`

Root cause:
- Query attachment mengambil semua attachment ticket dengan `where = { ticketId }`.
- Untuk EndUser, filtering visibility dilakukan setelah query di memory.
- `count()` juga menghitung semua attachment, termasuk internal/direct internal/comment internal.

Dampak:
- EndUser dapat menginfer jumlah internal attachment dari `meta.total`, `totalPages`, empty page, atau halaman yang item-nya lebih sedikit dari limit.
- Public attachment bisa terskip jika rows internal berada sebelum public rows pada pagination.

Checklist fix:
- [ ] Tambahkan method policy yang mengembalikan Prisma `where` untuk visible attachment EndUser.
- [ ] Terapkan visible `where` sebelum `findMany` dan `count`, bukan setelah query.
- [ ] Pastikan direct public attachment dan attachment dari public comment tetap tampil.
- [ ] Pastikan direct internal attachment dan attachment dari internal comment tidak masuk query EndUser.
- [ ] Hapus fallback filtering in-memory kecuali sebagai defense tambahan tanpa mempengaruhi `meta`.
- [ ] Tambahkan test untuk `meta.total`, `totalPages`, dan page dengan campuran public/internal.

Verifikasi yang disarankan:
- [ ] `cd backend && npm test -- attachments`
- [ ] Manual: buat ticket milik EndUser dengan 1 public dan 3 internal attachment, cek API EndUser hanya `total=1`.

---

### P1-02 - WebSocket memakai token lama setelah refresh

Severity: High  
Area: Frontend auth/realtime  
Referensi: `frontend/src/hooks/use-socket.ts:9-18,49`, `frontend/src/lib/axios.ts:86-103`

Root cause:
- `useSocket()` hanya depend pada `isAuthenticated` dan membaca token sekali via `getAccessToken()`.
- Axios refresh mengupdate access token di Zustand, tetapi socket yang sudah dibuat tidak di-recreate dan `socket.auth.token` tidak diupdate.

Dampak:
- Setelah access token expired, reconnect Socket.IO dapat memakai token expired.
- Notifikasi realtime bisa berhenti diam-diam sampai user refresh halaman/login ulang.

Checklist fix:
- [ ] Select `accessToken` langsung dari `useAuthStore` di `useSocket()`.
- [ ] Jadikan `accessToken` dependency effect.
- [ ] Saat token berubah, disconnect socket lama dan connect socket baru dengan token baru, atau update `socket.auth` lalu reconnect.
- [ ] Pada `connect_error` auth, jangan hanya `console.error`; trigger auth refresh state/refetch atau disconnect bersih.
- [ ] Tambahkan test/harness manual: login, paksa refresh token, lalu matikan/hidupkan network socket dan cek reconnect memakai token baru.

Verifikasi yang disarankan:
- [ ] `cd frontend && npm run build`
- [ ] Manual browser: inspect Socket.IO handshake setelah refresh token.

---

### P1-03 - Upload attachment/comment tidak atomic dan bisa meninggalkan orphan

Severity: High  
Area: Backend upload/storage/database consistency  
Referensi: `backend/src/attachments/attachments.service.ts:111-157`, `backend/src/comments/comments.service.ts:105-166`

Root cause:
- Direct attachment: file disimpan dulu (`storageService.save`) lalu DB row dibuat. Jika DB insert gagal, file tidak dihapus.
- Max direct attachment count dicek terpisah dari create, sehingga concurrent upload bisa melewati limit 5.
- Comment: comment row dibuat, lalu setiap file disimpan dan attachment row dibuat satu per satu. Jika attachment ke-2 gagal, file yang sudah dibuat dihapus, tetapi comment row dan attachment row yang sudah sukses tetap tersisa.
- Comment attachment juga tidak memakai magic-byte integrity check seperti direct attachment.

Dampak:
- Orphan file di disk tanpa DB row.
- Comment bisa muncul tanpa attachment yang dimaksud user.
- Attachment row bisa menunjuk file yang sudah dihapus saat cleanup parsial.
- Concurrent upload bisa melebihi limit attachment per ticket.
- Validasi content type antara direct attachment dan comment attachment tidak konsisten.

Checklist fix:
- [ ] Bungkus DB write direct attachment dengan `try/catch`; jika create gagal, panggil `storageService.delete(filePath)`.
- [ ] Untuk comment + attachments, gunakan Prisma transaction untuk comment row dan attachment rows.
- [ ] Simpan files dengan daftar `createdFiles`, rollback DB transaction bila ada error, lalu cleanup semua files.
- [ ] Terapkan magic-byte check yang sama untuk comment attachments.
- [ ] Untuk limit per-ticket, enforce secara transactional. Pilihan: serializable transaction, advisory lock per ticket, atau model counter/constraint yang aman concurrency.
- [ ] Tambahkan test partial failure: attachment create ke-2 throw, pastikan tidak ada comment/attachment partial dan files bersih.
- [ ] Tambahkan test concurrent upload bila memungkinkan.

Verifikasi yang disarankan:
- [ ] `cd backend && npm test -- comments`
- [ ] `cd backend && npm test -- attachments`

---

### P1-04 - Ticket status transition race-prone

Severity: High  
Area: Backend ticket workflow/concurrency  
Referensi: `backend/src/tickets/tickets.service.ts:308-364`

Root cause:
- Current status dibaca dan divalidasi sebelum transaction.
- Update dalam transaction memakai `tx.ticket.update({ where: { id }, data })`, tidak memastikan status masih sama dengan `oldStatus`.

Dampak:
- Dua request concurrent bisa sama-sama lolos validasi berdasarkan stale status.
- History bisa mencatat old/new value yang tidak merefleksikan state sebenarnya.
- Workflow valid transition bisa dilanggar karena last-writer-wins.

Checklist fix:
- [ ] Pindahkan read current status ke dalam transaction.
- [ ] Gunakan conditional update: `updateMany({ where: { id, status: oldStatus }, data })` dan cek `count === 1`.
- [ ] Jika count 0, return `409 Conflict` atau `400` dengan pesan status berubah, minta client refresh.
- [ ] Buat history hanya setelah conditional update sukses.
- [ ] Pertimbangkan row lock atau serializable transaction jika workflow makin kompleks.
- [ ] Tambahkan test concurrent/stale status minimal dengan mock `updateMany count=0`.

Verifikasi yang disarankan:
- [ ] `cd backend && npm test -- tickets`

---

### P1-05 - Deaktivasi user tidak revoke active session dan WebSocket

Severity: High  
Area: Backend auth/session/realtime  
Referensi: `backend/src/users/users.service.ts:91-100`, `backend/src/auth/auth.service.ts:120-128`, `backend/src/notifications/notifications.gateway.ts:61-71,89-94`

Root cause:
- `UsersService.update()` emit event hanya saat password berubah.
- `AuthService` revoke refresh tokens hanya untuk `user.password_changed` dan `user.deleted`.
- Gateway hanya cek `isActive` saat connection awal; socket user yang sudah connected tetap join room.

Dampak:
- User yang dinonaktifkan masih bisa memakai access token sampai expiry.
- Refresh token aktif tidak dicabut sampai refresh berikutnya gagal karena user inactive, tetapi key Redis masih ada sampai token dipakai/expiry.
- Socket aktif bisa tetap menerima notifikasi sampai disconnect.

Checklist fix:
- [ ] Deteksi perubahan `isActive` dari true ke false di `UsersService.update()`.
- [ ] Emit `user.deactivated` dengan `userId`.
- [ ] Tambahkan handler di `AuthService` untuk revoke all refresh tokens pada deactivation.
- [ ] Tambahkan handler di `NotificationsGateway` untuk disconnect semua socket user tersebut dan leave room.
- [ ] Pertimbangkan juga emit `user.activated` jika butuh audit/log, tanpa revoke.
- [ ] Tambahkan test event deactivation dan gateway disconnect.

Verifikasi yang disarankan:
- [ ] `cd backend && npm test -- users`
- [ ] Manual: login user, buka socket, deactivate dari admin, pastikan socket disconnect dan refresh gagal.

---

### P1-06 - EndUser dapat membaca internal master data counts dan SLA config

Severity: High  
Area: Backend authorization/data minimization  
Referensi: `backend/src/categories/categories.controller.ts:24-31`, `backend/src/common/repositories/category.repository.ts:9-18,22-32`, `backend/src/sub-categories/sub-categories.controller.ts:26-29`, `backend/src/sla/sla.controller.ts:23-25`

Root cause:
- Category/sub-category/SLA read endpoints hanya JWT-protected, tidak role-protected.
- Repository category mengembalikan `_count` ticket/subcategory/SLA dan `slaConfigs` pada detail.
- EndUser memang butuh category/subcategory aktif untuk create ticket, tetapi tidak perlu count internal dan SLA operational config.

Dampak:
- EndUser bisa melihat volume ticket per category/subcategory.
- EndUser bisa melihat response/resolution SLA config yang mungkin internal-operational.

Checklist fix:
- [ ] Pisahkan endpoint public form data dari admin master data.
- [ ] Untuk EndUser, return field minimal: `id`, `name`, `description`, active subcategories aktif.
- [ ] Lindungi endpoint yang return `_count`, inactive rows, dan `slaConfigs` dengan `@Roles(Role.Admin)` atau staff sesuai kebutuhan.
- [ ] Update frontend create ticket agar memakai endpoint minimal.
- [ ] Tambahkan API test EndUser tidak menerima `_count` dan `slaConfigs`.

Verifikasi yang disarankan:
- [ ] `cd backend && npm test -- categories`
- [ ] Manual: login EndUser dan cek response `/api/categories`, `/api/categories/:id`, `/api/sla-configs`.

---

### P1-07 - Telegram bot restart dapat menjalankan beberapa polling loop

Severity: High  
Area: Backend Telegram/integration concurrency  
Referensi: `backend/src/telegram/telegram.service.ts:57-67,104-129,230-231`

Root cause:
- `startBot()` set `polling=false`, resolve token, lalu `polling=true` dan memanggil `pollLoop()` baru.
- Loop lama yang sudah menjadwalkan `setTimeout` dapat resume setelah `polling` kembali true.
- Tidak ada generation id atau timeout handle untuk membatalkan loop lama.

Dampak:
- Multiple long-poll Telegram berjalan bersamaan.
- Bisa terjadi duplicate handling, API conflict, atau loop dengan token lama setelah config diganti.

Checklist fix:
- [ ] Tambahkan `pollingGeneration` number yang increment tiap `startBot()`.
- [ ] Pass generation ke `pollLoop(token, offset, generation)` dan stop jika generation stale.
- [ ] Simpan timeout handle dan clear timeout saat restart/shutdown.
- [ ] Pastikan `onApplicationShutdown()` clear timeout dan set generation stale.
- [ ] Tambahkan log saat old loop berhenti agar mudah audit.
- [ ] Tambahkan unit test sederhana dengan fake timers jika test infra mendukung.

Verifikasi yang disarankan:
- [ ] `cd backend && npm test -- telegram`
- [ ] Manual: save Telegram config beberapa kali, cek log hanya satu polling active.

---

### P1-08 - Manual backup script bisa inconsistent saat app live

Severity: High  
Area: Operations/backup consistency  
Referensi: `scripts/backup.sh:27-36`, `backend/src/maintenance/maintenance.service.ts:89-93`, `README.md:404-419`

Root cause:
- API backup mewajibkan maintenance mode kecuali `pre-restore`.
- Manual `scripts/backup.sh` langsung dump DB dan tar uploads tanpa cek maintenance.

Dampak:
- Saat ada upload/ticket baru selama backup, DB bisa mereferensikan file yang belum/ tidak masuk archive, atau archive punya file tanpa DB row.
- Restore dari backup manual bisa menghasilkan attachment missing file.

Checklist fix:
- [ ] Dokumentasikan secara eksplisit bahwa script hanya boleh dijalankan saat maintenance mode aktif.
- [ ] Tambahkan preflight script: cek maintenance via API atau Redis sebelum dump.
- [ ] Jika ada kebutuhan live backup, tambahkan flag eksplisit `--live-ok` dengan warning keras.
- [ ] Pertimbangkan satu entrypoint backup resmi via API agar semantics sama dengan UI.

Verifikasi yang disarankan:
- [ ] Jalankan script saat maintenance off dan pastikan gagal dengan pesan jelas.
- [ ] Jalankan script saat maintenance on dan pastikan backup sukses.

---

### P2-01 - Pagination comment/attachment tidak tervalidasi

Severity: Medium  
Area: Backend API validation  
Referensi: `backend/src/comments/comments.controller.ts:43-50`, `backend/src/attachments/attachments.controller.ts:69-77`, `backend/src/comments/comments.service.ts:189-214`, `backend/src/attachments/attachments.service.ts:176-202`

Root cause:
- Controller memakai `@Query('page') page = 1` dan `@Query('limit') limit = 20` tanpa DTO.
- Query raw bisa berupa string, `abc`, `-1`, `0`, atau angka sangat besar.
- Service melakukan `Math.min(limit, 100)` dan `skip = (page - 1) * actualLimit`, yang bisa menghasilkan `NaN` atau skip negatif.

Dampak:
- Prisma validation error bisa menjadi 500.
- Pagination metadata bisa invalid.
- Request aneh bisa membebani DB atau membuat response tidak predictable.

Checklist fix:
- [ ] Gunakan `PaginationQueryDto` untuk comment dan attachment endpoints.
- [ ] Pastikan `@Type(() => Number)`, `@IsInt`, `@Min(1)`, `@Max(100)` berlaku.
- [ ] Tambahkan defensive clamp di service untuk call internal.
- [ ] Tambahkan test `page=abc`, `page=-1`, `limit=10000` return 400.

Verifikasi yang disarankan:
- [ ] `cd backend && npm test -- comments`
- [ ] `cd backend && npm test -- attachments`

---

### P2-02 - Telegram config/check body tidak tervalidasi DTO

Severity: Medium  
Area: Backend API validation/config integrity  
Referensi: `backend/src/telegram/telegram.controller.ts:53-77`, `backend/src/telegram/telegram.service.ts:197-228,257-258`

Root cause:
- Controller memakai plain TypeScript object type pada `@Body()`.
- Class-validator tidak menvalidasi nested settings/template/event names.
- Service menyimpan `settings` yang diterima dengan type assertion.

Dampak:
- Invalid `enabledEvents`, boolean string, template object aneh, atau group chat invalid dapat tersimpan.
- Notification sending bisa rusak runtime atau diam-diam tidak terkirim.

Checklist fix:
- [ ] Buat DTO `UpdateTelegramConfigDto`, `TelegramSettingsDto`, `TelegramTemplatesDto`, `CheckTelegramConfigDto`.
- [ ] Validasi `enabledEvents` memakai `@IsArray`, `@IsIn([...], { each: true })`.
- [ ] Validasi boolean memakai `@IsBoolean`.
- [ ] Validasi template string length dan allowed variables bila perlu.
- [ ] Normalize defaults di service setelah DTO valid, bukan dari object arbitrary.
- [ ] Tambahkan test invalid event/body extra field return 400.

Verifikasi yang disarankan:
- [ ] `cd backend && npm test -- telegram`

---

### P2-03 - SLA create/update edge error keluar sebagai Prisma 500

Severity: Medium  
Area: Backend API error handling  
Referensi: `backend/src/sla/sla.service.ts:35-62`

Root cause:
- `create()` langsung connect category id dan create unique `(categoryId, priority)` tanpa precheck/catch.
- `update()` langsung update id tanpa mapping `P2025`.

Dampak:
- Category id tidak ada, duplicate priority per category, atau config id tidak ada bisa return 500/internal Prisma error.
- Kontrak error stabil `{ error: { code, message } }` melemah.

Checklist fix:
- [ ] Cek category existence sebelum create.
- [ ] Catch Prisma `P2002` dan return `ConflictException` untuk duplicate SLA config.
- [ ] Catch Prisma `P2025` dan return `NotFoundException` untuk update id tidak ada.
- [ ] Validasi response/resolution time masuk akal: `resolutionTimeMinutes >= responseTimeMinutes` jika business rule menghendaki.
- [ ] Tambahkan unit tests untuk missing category, duplicate, missing id.

Verifikasi yang disarankan:
- [ ] `cd backend && npm test -- sla`

---

### P2-04 - Frontend banyak failure mutasi/download/export yang silent

Severity: Medium  
Area: Frontend UX/API error handling  
Referensi: `frontend/src/components/tickets/AttachmentList.tsx:82-91,124-139`, `frontend/src/components/tickets/TicketList.tsx:170-175,189-196,253-260`, `frontend/src/pages/TicketsPage.tsx:51-66`, `frontend/src/hooks/use-tickets.ts:49-78,137-167,170-181`

Root cause:
- Beberapa mutation dipanggil tanpa `onError` atau `catch`.
- Direct upload `try/finally` tidak catch, download attachment catch tapi silent.
- Export CSV tidak catch error.

Dampak:
- Permission error, invalid transition, maintenance 503, max file size, unsupported file, network error, atau export failure terlihat seperti tidak terjadi apa-apa.
- User bisa mengira aksi berhasil padahal gagal.

Checklist fix:
- [ ] Gunakan `toast.error(getErrorMessage(err, ...))` untuk upload/download/export/status/priority/assign/delete.
- [ ] Disable control saat mutation terkait pending agar tidak double-submit.
- [ ] Pada select status/priority/assign, refetch/reset value jika mutation gagal.
- [ ] Tambahkan client-side file size/type validation sebelum upload untuk feedback cepat.
- [ ] Pastikan maintenance 503 menampilkan pesan maintenance, bukan generic error.

Verifikasi yang disarankan:
- [ ] `cd frontend && npm run build`
- [ ] Manual: upload file > limit, ubah status invalid, export saat API dimatikan, cek toast muncul.

---

### P2-05 - Pagination frontend tidak clamp saat total pages menyusut

Severity: Medium  
Area: Frontend pagination edge case  
Referensi: `frontend/src/components/tickets/TicketList.tsx:240-248`, `frontend/src/components/tickets/AttachmentList.tsx:217-225`, `frontend/src/hooks/use-notifications.ts:28-37`

Root cause:
- UI menyimpan `page` lokal/parent.
- Saat filter/delete/visibility membuat `totalPages` turun, page saat ini tidak dipaksa kembali ke range valid.

Dampak:
- User bisa berada di page 3 dari 2 dan melihat empty state padahal data ada di page sebelumnya.
- Issue makin terlihat bila backend attachment meta salah untuk EndUser.

Checklist fix:
- [ ] Setelah query sukses, hitung `totalPages` dari meta.
- [ ] Jika `page > totalPages`, panggil `setPage(totalPages || 1)`.
- [ ] Buat helper/hook reusable untuk pagination clamp bila dipakai banyak page.
- [ ] Pastikan tidak terjadi loop render dengan hanya set jika nilai berubah.

Verifikasi yang disarankan:
- [ ] `cd frontend && npm run build`
- [ ] Manual: buka page terakhir, hapus/filter data sampai total page turun, cek page otomatis valid.

---

### P2-06 - `VITE_API_URL` ada di template tapi frontend hardcode `/api`

Severity: Medium  
Area: Frontend deployment config  
Referensi: `frontend/.env.example:1`, `frontend/src/lib/axios.ts:6-8,86`, `frontend/src/hooks/use-socket.ts:17`

Root cause:
- Axios base URL hardcode `/api`.
- Refresh request hardcode `/api/auth/refresh` memakai axios global.
- Socket.IO hardcode namespace relatif `/notifications`.

Dampak:
- Deployment beda origin/subpath/proxy tidak bisa dikonfigurasi meski `VITE_API_URL` tersedia.
- Operator dapat mengisi env tetapi tidak berdampak.

Checklist fix:
- [ ] Putuskan apakah frontend memang hanya didukung same-origin nginx.
- [ ] Jika iya, hapus/ubah `frontend/.env.example` agar tidak misleading.
- [ ] Jika perlu support configurable API URL, gunakan `import.meta.env.VITE_API_URL ?? '/api'` untuk axios dan refresh.
- [ ] Konfigurasikan Socket.IO origin/path sesuai API URL.
- [ ] Update Docker build args/env jika Vite env dipakai di build time.

Verifikasi yang disarankan:
- [ ] `cd frontend && npm run build`
- [ ] Manual deploy dengan non-default API URL bila support dipilih.

---

### P2-07 - Redis password bisa leak lewat process args

Severity: Medium  
Area: Infra/secrets  
Referensi: `docker-compose.yml:87-90`

Root cause:
- Redis password dipass sebagai command argument: `redis-server --requirepass "$REDIS_PASSWORD"`.
- Healthcheck memakai `redis-cli -a "$REDIS_PASSWORD" ping`.

Dampak:
- Secret bisa terlihat via process inspection/container tooling/logging tertentu.
- Redis sendiri memperingatkan `-a` kurang aman.

Checklist fix:
- [ ] Gunakan Redis config file ter-generate/mounted dengan permission ketat, atau Docker secrets.
- [ ] Untuk healthcheck, gunakan env `REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping`.
- [ ] Pastikan secret tidak tercetak di logs.

Verifikasi yang disarankan:
- [ ] `docker compose config` dan inspect command output tidak memuat password literal.
- [ ] Healthcheck Redis tetap healthy.

---

### P2-08 - nginx real IP trust terlalu luas

Severity: Medium  
Area: Infra/rate-limit/log integrity  
Referensi: `nginx/nginx.conf:33-40,63,73`

Root cause:
- nginx trust semua private ranges `172.16.0.0/12`, `192.168.0.0/16`, `10.0.0.0/8` sebagai real IP proxies.
- Jika client berada di LAN/private network, header `X-Forwarded-For` bisa spoofable.

Dampak:
- Log IP bisa dipalsukan.
- Rate limit berbasis `$binary_remote_addr` dapat dipengaruhi jika real IP terganti dari header yang tidak trusted.

Checklist fix:
- [ ] Jika tidak ada reverse proxy upstream, hapus `set_real_ip_from` dan `real_ip_header`.
- [ ] Jika ada reverse proxy upstream, trust hanya IP/subnet proxy tersebut.
- [ ] Dokumentasikan topology proxy di README/deployment notes.
- [ ] Test rate limit dengan forged `X-Forwarded-For`.

Verifikasi yang disarankan:
- [ ] `docker compose exec nginx nginx -t`
- [ ] Manual curl dengan header `X-Forwarded-For` dan cek access log.

---

### P3-01 - Login redirect mengabaikan route tujuan awal

Severity: Low/Medium  
Area: Frontend auth UX  
Referensi: `frontend/src/auth/ProtectedRoute.tsx:34-35`, `frontend/src/hooks/use-auth.ts:18-22`

Root cause:
- `ProtectedRoute` mengirim `state.from` ke login.
- `useLogin` selalu `navigate('/tickets')` setelah sukses.

Dampak:
- User yang membuka link ticket/admin langsung harus navigasi ulang setelah login.

Checklist fix:
- [ ] Di login flow, baca `location.state.from`.
- [ ] Setelah login sukses, redirect ke `from.pathname + search` jika role user allowed.
- [ ] Fallback ke `/tickets`.

Verifikasi yang disarankan:
- [ ] Manual: buka `/admin/maintenance` saat logout, login admin, pastikan kembali ke `/admin/maintenance`.

---

### P3-02 - Notification unread count bisa drift

Severity: Low/Medium  
Area: Frontend notification state  
Referensi: `frontend/src/hooks/use-notifications.ts:40-52`

Root cause:
- `useMarkAsRead` decrement local count pada setiap success.
- Tidak cek apakah notification memang unread saat request dikirim.

Dampak:
- Double click/retry/concurrent mark-read bisa membuat count terlalu kecil sampai refetch berikutnya.

Checklist fix:
- [ ] Disable tombol mark-read per item saat mutation pending.
- [ ] Invalidate/refetch `notifications-unread-count` dan set count dari server.
- [ ] Jika tetap optimistic, decrement hanya jika cache notification sebelumnya `isRead=false`.

Verifikasi yang disarankan:
- [ ] Manual double-click mark read dan cek count tidak negatif/drift.

---

### P3-03 - Telegram assignment notification kehilangan subject

Severity: Low  
Area: Backend Telegram event payload  
Referensi: `backend/src/tickets/tickets.service.ts:416-422`, `backend/src/telegram/telegram.listener.ts:27-41`

Root cause:
- Listener expects `payload.subject`.
- Event `ticket.assigned` tidak include `subject`.

Dampak:
- Template `Ticket Assigned` bisa menampilkan subject kosong/undefined.

Checklist fix:
- [ ] Tambahkan `subject: ticket.subject` saat emit `ticket.assigned`.
- [ ] Pertimbangkan include assigner/assignee display name, bukan hanya id.
- [ ] Tambahkan test render notification assignment.

Verifikasi yang disarankan:
- [ ] Trigger assign ticket dan cek pesan Telegram berisi subject.

---

### P3-04 - Object URL thumbnail cache tidak pernah direvoke

Severity: Low  
Area: Frontend memory leak  
Referensi: `frontend/src/components/tickets/AttachmentList.tsx:10,27-31`, `frontend/src/components/tickets/CommentSection.tsx:31-35`

Root cause:
- Global `thumbnailCache` menyimpan `URL.createObjectURL()` tanpa eviction/revoke.

Dampak:
- Long session dengan banyak image attachment dapat meningkatkan memory usage.

Checklist fix:
- [ ] Batasi cache size dan revoke URL saat evicted.
- [ ] Atau hapus object URL cache dan rely pada browser/http cache.
- [ ] Revoke semua cached URL saat logout/query clear jika cache tetap global.

Verifikasi yang disarankan:
- [ ] Manual load banyak image attachment dan cek memory/object URL tidak terus tumbuh.

---

### P3-05 - DTO kategori/user menerima string kosong atau whitespace

Severity: Low/Medium  
Area: Backend validation/data quality  
Referensi: `backend/src/categories/dto/create-category.dto.ts:1-10`, `backend/src/users/dto/create-user.dto.ts:10-23`, `backend/src/categories/dto/update-category.dto.ts:1-4`, `frontend/src/components/admin/MasterDataManagement.tsx:128-143,197-209`, `frontend/src/components/admin/UserManagement.tsx:73-97`

Root cause:
- DTO memakai `@IsString()` tanpa `@IsNotEmpty()` atau trim transform.
- Frontend admin form mengirim raw string untuk beberapa form.

Dampak:
- Nama kategori/user kosong/whitespace bisa lolos validasi backend bila Prisma tidak menolak.
- Data master menjadi sulit dipakai di ticket form/list.

Checklist fix:
- [ ] Tambahkan `@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)` untuk field string penting.
- [ ] Tambahkan `@IsNotEmpty()` dan batas panjang (`@MaxLength`) untuk name/description yang relevan.
- [ ] Tambahkan client-side validation agar admin mendapat feedback sebelum submit.
- [ ] Tambahkan test whitespace-only returns 400.

Verifikasi yang disarankan:
- [ ] `cd backend && npm test -- categories users`
- [ ] Manual submit whitespace-only di admin UI.

## Catatan Positif

- Access token tidak ditemukan tersimpan di `localStorage` atau `sessionStorage`; persistence yang terdeteksi hanya theme (`frontend/src/main.tsx:21`, `frontend/src/stores/theme-store.ts:17`). Ini sesuai non-negotiable rule.
- Backend sudah memakai global `ValidationPipe` dengan `whitelist`, `forbidNonWhitelisted`, dan `transform` di `backend/src/main.ts:62-68`.
- Attachment download visibility sudah dicek via policy di `backend/src/attachments/attachments.service.ts:205-223`; masalah utama ada pada list/count pagination.
- Backup API sudah punya lock token compare-delete di `MaintenanceService.releaseLock()` untuk backup/restore lock; issue lock token masih ada di SLA cron lock.
- CSV export service sudah memiliki escaping formula-leading cells menurut hasil eksplorasi dan tidak menjadi prioritas bug sesi ini.

## Catatan Untuk Agent AI Sesi Berikutnya

- Jangan langsung refactor besar. Mulai dari P0 dan P1 dengan patch kecil per isu.
- Paling aman urutan fix:
  1. P0-01 restore maintenance safety.
  2. P1-01 attachment visibility query/count.
  3. P1-03 upload atomic cleanup.
  4. P1-02 socket token refresh.
  5. P0-02 env template/README Docker.
- Saat mengubah backend, ikuti flow project: controller -> service -> repository. Jangan inject `PrismaService` langsung ke service baru kecuali pattern existing memang repository tidak cukup.
- Jangan menyimpan access token ke storage persisten. Zustand auth state harus tetap memory-only.
- Jangan expose Telegram token/group chat secret ke frontend. Tetap gunakan `hasBotToken` dan `hasGroupChatId` flags.
- Untuk P1-01, fix harus di backend. Frontend hanya defensive clamp, bukan client-side filtering internal data.
- Untuk P0-01, hati-hati jangan mematikan maintenance pada failure. Ini behavior intentionally safer, tetapi perlu diberi pesan operator jelas.
- Untuk env/Docker, jangan ubah HTTP/HTTPS/nginx flow kecuali memang diminta. Scope cukup template env dan README agar compose fresh start benar.
- Worktree bisa dirty. Jangan revert perubahan user.
- Setelah tiap patch, jalankan verifikasi sempit sesuai area:
  - Backend: `cd backend && npm test -- <area>` atau `npm run build` bila test spesifik tidak ada.
  - Frontend: `cd frontend && npm run build`; lint bila menyentuh style/imports banyak.
  - Infra: `docker compose config`; `nginx -t` di container bila nginx berubah.

## Checklist Global Progress

- [ ] Semua P0 selesai dan terverifikasi.
- [ ] Semua P1 selesai dan terverifikasi.
- [ ] Semua P2 yang berdampak runtime selesai atau diputuskan ditunda.
- [ ] Semua P3 dievaluasi, minimal dibuat issue/backlog.
- [ ] Tambah regression tests untuk authorization visibility, restore failure, upload failure, dan status race.
- [ ] Update README/AGENTS.md bila ada perubahan behavior operasional.
- [ ] Jalankan build backend/frontend setelah rangkaian fix utama selesai.
