# Code Review Arsitektur - IT Support Ticketing

Tanggal review: 2026-06-26
Reviewer: senior fullstack engineer, static architecture review
Scope utama: arsitektur backend, frontend, API contract, security boundary, deployment/infra, operasional, testability, dan konsistensi dokumentasi.

Review ini bersifat read-only terhadap source code. Tidak ada source runtime yang diubah. Dokumen ini dibuat sebagai backlog teknis yang bisa dikerjakan bertahap oleh agent/manusia berikutnya.

## Ringkasan Eksekutif

Arsitektur dasar proyek sudah kuat untuk aplikasi internal: NestJS modular, Prisma, Redis, React, TanStack Query, Nginx, dan Docker Compose sudah terbentuk jelas. Namun ada beberapa drift penting antara kontrak yang tertulis di `AGENTS.md`/`ARCHITECTURE.md` dengan implementasi aktual.

Risiko tertinggi ada di boundary akses EndUser untuk attachment internal, inkonsistensi kontrak response API, klaim horizontal scaling yang belum sesuai implementasi realtime/worker, dan operasional backup/restore yang masih perlu lock/validasi lebih kuat. Frontend juga punya coupling kuat ke bentuk response backend dan policy role tersebar di route, sidebar, hook, serta komponen.

Prioritas perbaikan yang disarankan:

1. Tutup gap security/authorization yang bisa mengekspos attachment internal atau metadata internal ke EndUser.
2. Finalisasi satu kontrak API response dan error, lalu pasang di backend dan adapter frontend.
3. Perbaiki readiness multi-instance: Socket.IO Redis adapter, lock atomic untuk cron, dan singleton Telegram worker/polling.
4. Kuatkan operasional restore/backup dan konsistensi file/database.
5. Rapikan boundary frontend: API adapter, permission registry, dan server state source of truth.
6. Tambah test arsitektural/regresi untuk semua boundary kritikal sebelum refactor besar.

## Snapshot Arsitektur Saat Ini

Backend:

- NestJS module per domain: auth, users, tickets, comments, attachments, categories, SLA, notifications, telegram, maintenance, dashboard, health.
- Repository layer ada di `backend/src/common/repositories`, tetapi `PrismaModule` dan `RepositoriesModule` dibuat global.
- Business flow penting masih terpusat di service besar, terutama `TicketsService` dan `MaintenanceService`.
- Event-driven flow menggunakan `@nestjs/event-emitter` untuk notification dan Telegram.
- Redis dipakai untuk refresh token, maintenance flag, backup lock, dan cron lock.

Frontend:

- React routes di `frontend/src/App.tsx`, page di `frontend/src/pages`, TanStack Query hooks di `frontend/src/hooks`, Zustand untuk auth/theme/notification count.
- API client berada di `frontend/src/lib/axios.ts`, tetapi belum ada typed API adapter untuk unwrap response.
- Permission/role policy tersebar di route, sidebar, dan komponen.

Infra:

- Docker Compose menjalankan frontend builder, Nginx, API, PostgreSQL, Redis.
- Nginx melayani SPA dan reverse proxy `/api/` serta `/socket.io/`.
- Compose saat ini HTTP-only, sedangkan sebagian env/dokumen masih mengasumsikan HTTPS.

## Tracking Checklist Global

- [x] F-01 Tutup gap visibility attachment internal untuk EndUser.
- [x] F-02 Satukan kontrak success/error API dan update frontend adapter.
- [ ] F-03 Rapikan module/repository boundary dan akses Prisma langsung.
- [ ] F-04 Pecah service/komponen yang terlalu gemuk setelah kontrak aman.
- [ ] F-05 Benahi readiness multi-instance untuk WebSocket, Telegram, dan cron SLA.
- [ ] F-06 Perkuat konsistensi file/database dan lock operasi backup/restore.
- [ ] F-07 Sinkronkan auth session expiry, cookie config, dan HTTP/HTTPS env.
- [ ] F-08 Perbaiki typed event contract Telegram dan link code.
- [ ] F-09 Pusatkan permission policy frontend dan hindari hook admin-only untuk non-admin.
- [ ] F-10 Pindahkan notification unread count ke server-state source of truth.
- [ ] F-11 Selaraskan pagination `All` frontend dengan DTO backend.
- [ ] F-12 Pisahkan public maintenance health flow dari admin maintenance flow.
- [ ] F-13 Rapikan infra drift: env, upload limit, security headers, image tags, builder volume.
- [ ] F-14 Samakan backup CLI dengan Admin UI dan validasi archive aman.
- [ ] F-15 Tambahkan test arsitektural/regresi untuk boundary kritikal.
- [ ] F-16 Update dokumentasi setelah implementasi agar `AGENTS.md`, `README.md`, dan `ARCHITECTURE.md` tidak drift.

## Temuan Detail

### F-01 - P0 - Visibility attachment internal tidak terpusat untuk EndUser

Status: Done
Area: Backend authorization, data visibility, ticket domain

Bukti:

- `backend/src/tickets/tickets.service.ts:153-164` menghitung visible attachment EndUser tanpa filter `AttachmentVisibility.PUBLIC`.
- `backend/src/tickets/tickets.service.ts:261-264` ticket detail EndUser memfilter attachment hanya berdasarkan `commentId` atau comment PUBLIC, tetapi tidak mengecualikan direct attachment INTERNAL.
- `backend/src/tickets/tickets.service.ts:292-305` count ticket detail EndUser memakai filter yang sama dan belum mengecek `visibility`.
- `backend/src/attachments/attachments.service.ts:172-176` endpoint attachment dedicated sudah memfilter `comment.type !== INTERNAL` dan `visibility !== INTERNAL`.

Root cause:

Aturan visibility attachment diimplementasikan berulang di beberapa service. Tidak ada satu domain policy/helper/repository method untuk menjawab pertanyaan: attachment mana yang boleh dilihat role tertentu.

Dampak:

- EndUser berpotensi melihat metadata atau data direct attachment INTERNAL pada response ticket detail.
- Count attachment pada list/detail bisa membocorkan keberadaan file internal.
- Risiko regresi tinggi karena aturan visibility tersebar.

Checklist fix:

- [ ] Buat satu policy/helper, misalnya `TicketVisibilityPolicy` atau method repository `buildVisibleAttachmentWhere(userRole)`.
- [ ] Policy EndUser harus mensyaratkan `visibility: AttachmentVisibility.PUBLIC`.
- [ ] Policy EndUser juga harus mengecualikan attachment yang terhubung ke comment INTERNAL.
- [ ] Pakai policy yang sama di `TicketsService.findAll`, `TicketsService.findById`, `AttachmentsService.findByTicketId`, dan `AttachmentsService.getDownloadInfo`.
- [ ] Pastikan direct attachment INTERNAL tidak muncul di `ticket.attachments` untuk EndUser.
- [ ] Pastikan `_count.attachments` EndUser hanya menghitung public direct attachment dan attachment dari public comment.
- [ ] Tambah unit test untuk EndUser own ticket dengan kombinasi public/internal direct attachment dan attachment di public/internal comment.
- [ ] Tambah regression test bahwa ITSupport/Admin tetap melihat attachment internal.

Verifikasi:

- [ ] Jalankan `npm test -- tickets.service.spec.ts` atau test backend yang relevan di `backend`.
- [ ] Manual API check: EndUser `GET /api/tickets/:id` tidak berisi attachment INTERNAL.
- [ ] Manual API check: EndUser count attachment sama dengan jumlah attachment visible.

### F-02 - P1 - Kontrak success/error API drift dan belum enforced global

Status: Done
Area: Backend API contract, frontend API client, error handling

Bukti:

- `AGENTS.md:11-12` menyatakan success API `{ data, meta? }` dan error `{ error: { code, message } }`.
- `backend/src/common/interceptors/transform.interceptor.ts:12-31` sudah ada interceptor untuk wrap `{ data }`, tetapi tidak diregistrasikan global.
- `backend/src/main.ts:51-60` hanya memasang `ValidationPipe` dan `HttpExceptionFilter`, tidak memasang transform interceptor.
- `backend/src/app.module.ts:50-60` hanya memasang `APP_GUARD`, tidak ada `APP_INTERCEPTOR`.
- `backend/src/common/filters/http-exception.filter.ts:24-33` memakai `resp.error` dari default Nest response sebagai `code`; ini bisa menghasilkan `Bad Request` atau `Service Unavailable`, bukan code stabil seperti `BAD_REQUEST` atau `MAINTENANCE`.
- `backend/src/common/guards/maintenance.guard.ts:36-39` melempar `ServiceUnavailableException` string sehingga filter akan cenderung menghasilkan code default dari Nest, bukan kontrak maintenance yang stabil.
- `frontend/src/hooks/use-auth.ts:15-20`, `frontend/src/lib/axios.ts:60-62`, dan `frontend/src/auth/ProtectedRoute.tsx` mengasumsikan auth response flat.
- `frontend/src/hooks/use-users.ts:9-10` mengasumsikan paginated `{ data }`.
- `frontend/src/hooks/use-categories.ts:9-10` mengasumsikan raw array.

Root cause:

Ada kontrak API yang tertulis, tetapi enforcement backend dan unwrap frontend belum dibuat sebagai satu layer arsitektur. Akibatnya setiap endpoint/hook menafsirkan response sendiri-sendiri.

Dampak:

- Perubahan kecil pada backend response bisa mematahkan banyak hook frontend.
- Error handling sulit distandarkan karena `code` tidak stabil.
- Dokumentasi API tidak bisa dipercaya sebagai contract test.

Checklist fix:

- [ ] Putuskan satu kontrak final: rekomendasi tetap mengikuti `AGENTS.md`, yaitu semua success non-file dibungkus `{ data, meta? }`.
- [ ] Register `TransformInterceptor` global via `APP_INTERCEPTOR` di `app.module.ts` atau `app.useGlobalInterceptors()` di `main.ts`.
- [ ] Audit endpoint yang memakai `@Res({ passthrough: true })`, stream/download/blob, dan CSV agar tidak dibungkus secara salah.
- [ ] Ubah `HttpExceptionFilter` agar memprioritaskan `resp.code` jika ada.
- [ ] Jika `resp.code` tidak ada, gunakan `getCodeFromStatus(status)` dan jangan gunakan `resp.error` sebagai code stabil.
- [ ] Ubah maintenance exception menjadi object eksplisit, misalnya `{ code: 'MAINTENANCE', message }`, atau pastikan filter memetakan 503 ke `MAINTENANCE`.
- [ ] Buat frontend helper `unwrapData<T>()`, `unwrapPage<T>()`, dan `unwrapBlob()` di sekitar `apiClient`.
- [ ] Update semua hooks agar tidak langsung membaca `response.data` dengan asumsi yang berbeda-beda.
- [ ] Hapus `refreshToken` dari `frontend/src/types/index.ts:152-156` jika frontend memang tidak menerima token refresh di body.
- [ ] Tambah contract test minimal untuk login, refresh, tickets list, categories list, maintenance error, dan validation error.

Verifikasi:

- [ ] Jalankan `npm run build` di `backend`.
- [ ] Jalankan `npm run build` di `frontend`.
- [ ] Manual smoke: login, refresh, ticket list, create ticket, categories, maintenance banner, CSV/download.

### F-03 - P1 - Module/repository boundary terlalu global dan Prisma masih bocor ke luar repository

Status: Open
Area: Backend architecture, module dependency, testability

Bukti:

- `backend/src/prisma/prisma.module.ts:4-7` menandai `PrismaModule` sebagai `@Global()`.
- `backend/src/common/repositories/repositories.module.ts:12-35` menandai semua repository sebagai global.
- `backend/src/app.module.ts:33-35` mengimpor `PrismaModule`, `RepositoriesModule`, dan `RedisModule` di root sehingga dependency antar feature menjadi implisit.
- `backend/src/dashboard/dashboard.service.ts:1-10` menginject `PrismaService` langsung di service domain.
- `backend/src/dashboard/dashboard.service.ts:122-139` melakukan raw SQL langsung dari service.
- `backend/src/health/health.controller.ts:1-18` menginject `PrismaService` langsung untuk health check. Ini bisa diterima sebagai operational exception, tetapi perlu dicatat agar tidak menjadi pola domain service.
- `grep PrismaService backend/src` menunjukkan direct Prisma di repository dan juga `dashboard`/`health`.

Root cause:

Repository pattern sudah dikenalkan, tetapi module dibuat global sehingga dependency tidak eksplisit. Ini membuat service mudah mengakses Prisma langsung dan melemahkan boundary yang dijanjikan arsitektur.

Dampak:

- Dependency graph sulit dibaca dan dites.
- Repository menjadi pass-through, bukan boundary domain yang konsisten.
- Refactor atau mock service menjadi lebih mahal.

Checklist fix:

- [ ] Tetapkan aturan: domain service tidak inject `PrismaService` langsung, kecuali operational modules yang disetujui seperti health.
- [ ] Pindahkan raw query dashboard ke `DashboardRepository` atau method khusus di `TicketRepository`.
- [ ] Hilangkan `@Global()` dari `RepositoriesModule` secara bertahap setelah tiap feature module mengimpor repository yang dibutuhkan.
- [ ] Pertimbangkan mempertahankan `PrismaModule` global hanya jika memang diputuskan sebagai infra singleton; dokumentasikan exception-nya.
- [ ] Tambahkan lint/check sederhana atau grep CI yang flag `PrismaService` di luar `common/repositories`, `prisma`, dan `health`.
- [ ] Kurangi penggunaan `as any` di repository/service dengan tipe Prisma yang spesifik.

Verifikasi:

- [ ] `npm run build` backend.
- [ ] Unit test service dengan mock repository tetap berjalan.
- [ ] Grep `PrismaService` hanya muncul di lokasi yang disetujui.

### F-04 - P2 - Service dan komponen terlalu gemuk, responsibility bercampur

Status: Open
Area: Maintainability, cohesion, feature boundaries

Bukti:

- `backend/src/tickets/tickets.service.ts:41-552` menangani create, query/filter, CSV export, detail visibility, workflow status, assignment, priority, delete, dan ticket number generation.
- `backend/src/maintenance/maintenance.service.ts:36-433` menangani mode, listing, backup, restore DB, restore uploads, gzip/tar validation, path validation, dan PostgreSQL options.
- `frontend/src/pages/MyAccountPage.tsx:27-485` mencampur profile, change password, Telegram link, Telegram config, test notification, dan check config.
- `frontend/src/layout/Navbar.tsx:17-235` mencampur query notification, badge, dropdown, theme, profile menu, logout, dan navigation.
- `frontend/src/components/admin/MasterDataManagement.tsx` melakukan API call langsung dari component dan memuat banyak state master data dalam satu file.

Root cause:

Feature tumbuh secara incremental tanpa extraction boundary. Belum ada pattern container/presenter atau sub-service per workflow.

Dampak:

- Testing granular sulit.
- Perubahan kecil berisiko menyentuh file besar dan unrelated behavior.
- Reuse rendah dan regressions lebih mudah terjadi.

Checklist fix:

- [ ] Jangan refactor besar sebelum F-01 dan F-02 selesai, agar kontrak aman dulu.
- [ ] Pecah `TicketsService` menjadi minimal `TicketQueryService`, `TicketWorkflowService`, `TicketExportService`, dan `TicketNumberService` jika perubahan ticket domain berikutnya masuk.
- [ ] Pecah `MaintenanceService` menjadi orchestration service plus helper/service untuk backup, restore database, restore uploads, archive validation.
- [ ] Pecah `MyAccountPage` menjadi `ProfileCard`, `ChangePasswordSection`, `AdminTelegramLinkSection`, dan `AdminTelegramConfigSection`.
- [ ] Pecah `Navbar` menjadi `NotificationDropdown`, `ThemeMenu`, dan `ProfileMenu`.
- [ ] Pindahkan semua API call component admin ke hook feature di `frontend/src/hooks`.

Verifikasi:

- [ ] Build frontend dan backend.
- [ ] Smoke test halaman My Account, Navbar notification, ticket workflows, dan maintenance restore/backup UI.

### F-05 - P1 - Klaim horizontal scaling belum sesuai implementasi realtime/worker

Status: Open
Area: Scaling architecture, realtime, background jobs

Bukti:

- `backend/src/notifications/notifications.gateway.ts:35` menyimpan socket user di memory per proses.
- `backend/src/notifications/notifications.gateway.ts:82-86` emit hanya ke room pada instance lokal.
- `backend/src/telegram/telegram.service.ts:49-66` setiap instance API akan start Telegram polling saat bootstrap.
- `backend/src/telegram/telegram.service.ts:104-128` long polling Telegram berjalan lokal di tiap process.
- `backend/src/sla/sla.service.ts:64-75` lock cron memakai `exists` lalu `set`, bukan operasi atomic `SET NX EX`.
- `ARCHITECTURE.md:521-535` menyebut stateless API dan scaling/HPA, tetapi detail worker/realtime belum siap.

Root cause:

API sudah stateless untuk HTTP auth, tetapi komponen realtime dan background worker masih stateful per instance. Redis sudah tersedia, tetapi belum dipakai sebagai adapter/leader election untuk semua area.

Dampak:

- Multi-replica API bisa kehilangan WebSocket notification jika event dibuat di instance berbeda dari socket user.
- Telegram polling bisa konflik atau duplikat antar instance.
- Cron SLA bisa race karena lock non-atomic.

Checklist fix:

- [ ] Tambahkan Socket.IO Redis adapter untuk broadcast room lintas instance.
- [ ] Hilangkan kebutuhan `userSockets` map untuk routing utama, atau gunakan hanya untuk observability lokal.
- [ ] Tambahkan method Redis atomic `setNx(key, value, ttlSeconds)` di `RedisService`.
- [ ] Ubah lock SLA menjadi atomic `SET key value NX EX ttl`.
- [ ] Pastikan lock punya owner token dan delete hanya owner jika proses bisa overlap panjang.
- [ ] Jadikan Telegram polling singleton via Redis leader lock, dedicated worker process, atau migrasi ke webhook dengan satu endpoint publik.
- [ ] Update `ARCHITECTURE.md` agar scaling readiness jujur: HTTP stateless sudah siap, realtime/worker butuh adapter/leader.

Verifikasi:

- [ ] Unit test lock Redis atomic.
- [ ] Manual run dua API instance lokal jika memungkinkan dan pastikan satu Telegram poller aktif.
- [ ] Manual test notification WebSocket lintas instance jika adapter sudah terpasang.

### F-06 - P1 - Konsistensi file/database dan lock operasi destruktif belum kuat

Status: Open
Area: Storage architecture, transactional boundaries, maintenance operations

Bukti:

- `backend/src/attachments/attachments.service.ts:122-146` menyimpan file dulu, lalu insert DB. Jika insert DB gagal, file orphan bisa tertinggal.
- `backend/src/tickets/tickets.service.ts:468-480` menghapus file sebelum transaksi delete DB selesai. Jika DB delete gagal, record bisa menunjuk file yang sudah hilang.
- `backend/src/maintenance/maintenance.service.ts:76-85` lock hanya dipakai untuk backup.
- `backend/src/maintenance/maintenance.service.ts:188-225` restore destruktif tidak mengambil lock operasi restore tersendiri sebelum enable maintenance dan drop schema.
- `backend/src/maintenance/maintenance.service.ts:303-333` restore uploads melakukan extract dan swap, tetapi validasi archive masih terbatas.
- `backend/src/maintenance/maintenance.service.ts:335-374` validasi tar hanya path/name traversal, belum mengecek tipe entry symlink/hardlink seperti klaim dokumen.

Root cause:

Database dan filesystem diperlakukan sebagai satu logical transaction, tetapi tidak ada transaction manager lintas resource. Backup/restore sudah punya sebagian guard, tetapi lock belum mencakup seluruh operasi destruktif.

Dampak:

- File orphan atau missing file bisa muncul saat error parsial.
- Restore paralel atau backup saat restore bisa merusak state operasional.
- Archive uploads berbahaya berisiko menyisipkan symlink/hardlink jika tidak ditolak eksplisit.

Checklist fix:

- [ ] Untuk upload: jika DB create gagal setelah file save, lakukan compensating cleanup `storageService.delete(filePath)`.
- [ ] Untuk delete ticket: hapus DB dalam transaction dulu, lalu hapus file sebagai best-effort cleanup, atau catat file cleanup job setelah commit.
- [ ] Tambahkan periodic orphan cleanup yang membandingkan DB attachment path dengan filesystem, jika storage lokal tetap dipakai.
- [ ] Tambahkan `MAINTENANCE_OPERATION_LOCK_KEY` untuk backup dan restore, bukan backup saja.
- [ ] Ambil lock sebelum `setMaintenanceMode(true)` pada restore.
- [ ] Pastikan lock punya TTL cukup panjang dan owner token agar tidak dilepas operasi lain.
- [ ] Validasi tar entry type dengan `tar -tvzf` parsing atau library tar yang bisa menolak symlink/hardlink/device file.
- [ ] Gunakan option tar yang aman saat extract dan jangan follow symlink.

Verifikasi:

- [ ] Unit test upload cleanup saat repository create gagal.
- [ ] Unit/integration test ticket delete saat storage delete gagal dan saat DB delete gagal.
- [ ] Test restore menolak tar dengan `../`, absolute path, symlink, dan hardlink.
- [ ] Test restore kedua gagal saat lock masih aktif.

### F-07 - P1 - Auth session expiry, cookie, dan HTTP/HTTPS config tidak satu sumber

Status: Open
Area: Auth architecture, deployment config

Bukti:

- `backend/src/auth/auth.service.ts:19-27` TTL Redis refresh token hardcoded 7 hari.
- `backend/src/auth/auth.service.ts:141-153` JWT refresh expiry memakai `JWT_REFRESH_TOKEN_EXPIRY` env.
- `backend/src/auth/auth.controller.ts:35-40` cookie login maxAge hardcoded 7 hari.
- `backend/src/auth/auth.controller.ts:55-61` cookie refresh maxAge hardcoded 7 hari.
- `docker-compose.yml:19-20` hanya expose port 80.
- `nginx/nginx.conf:43-46` listen 80 dan `client_max_body_size 10m`.
- `.env.example:19` memakai `CORS_ORIGIN=https://helpdesk.rsmch.internal`, sedangkan `README.md:227` menyebut app tersedia via `http://helpdesk.rsmch.internal`.

Root cause:

Belum ada centralized config service untuk auth duration dan deployment mode. Local HTTP dan production HTTPS masih tercampur di contoh env/dokumen.

Dampak:

- JWT refresh bisa expired lebih cepat/lambat dari Redis TTL dan cookie maxAge.
- Compose HTTP-only bisa mengirim refresh cookie tanpa `secure` jika dipakai seperti production.
- Developer/onboarding bisa salah set env karena contoh root `.env.example` production-style tapi belum lengkap.

Checklist fix:

- [ ] Buat util parser duration untuk `JWT_REFRESH_TOKEN_EXPIRY` yang menghasilkan milliseconds dan seconds.
- [ ] Gunakan duration yang sama untuk JWT `expiresIn`, Redis TTL, dan cookie `maxAge`.
- [ ] Tambahkan config object typed untuk auth dan cookie.
- [ ] Pisahkan env contoh local HTTP dan production HTTPS, misalnya `.env.local.example` dan `.env.production.example`.
- [ ] Tambahkan `REDIS_PASSWORD` di root `.env.example` jika `NODE_ENV=production` tetap dipakai.
- [ ] Perluas daftar weak secret di `main.ts:20`, termasuk `change-this-to-random-secret`.
- [ ] Dokumentasikan bahwa Compose default adalah local HTTP, production wajib TLS terminator atau konfigurasi Nginx 443.

Verifikasi:

- [ ] Unit test parser duration untuk `15m`, `7d`, angka seconds, dan invalid value.
- [ ] Manual login/refresh dengan local HTTP tetap bekerja.
- [ ] Production-like config menghasilkan cookie `secure=true` saat `X-Forwarded-Proto=https`.

### F-08 - P1 - Telegram event contract dan link code tidak type-safe

Status: Open
Area: Event architecture, Telegram integration

Bukti:

- `backend/src/telegram/telegram.service.ts:418-428` generate link code sepanjang 10 karakter.
- `backend/src/telegram/telegram.service.ts:138-145` bot `/start` hanya menerima code panjang 6.
- `backend/src/tickets/tickets.service.ts:419-425` event `ticket.assigned` tidak mengirim `subject`.
- `backend/src/telegram/telegram.listener.ts:27-40` listener `ticket.assigned` mengharapkan `subject` untuk template.
- `backend/src/telegram/telegram.service.ts:20-27` template menggunakan variable seperti `{subject}`.

Root cause:

Event payload memakai string event dan object literal tanpa type contract bersama. Link code length juga tidak punya konstanta tunggal.

Dampak:

- Telegram linking bisa gagal permanen karena code valid di UI ditolak bot.
- Template assigned bisa mengirim `undefined`/kosong untuk subject.
- Event integration rentan drift setiap ada field baru.

Checklist fix:

- [ ] Buat `ticket-events.ts` berisi nama event dan TypeScript interface payload.
- [ ] Gunakan interface yang sama di emitter dan listener.
- [ ] Tambahkan compile-time helper `emitTicketAssigned(payload: TicketAssignedEvent)` atau wrapper event service.
- [ ] Definisikan `TELEGRAM_LINK_CODE_LENGTH` satu kali dan gunakan di generate serta validation.
- [ ] Update UI copy jika panjang code berubah.
- [ ] Tambahkan unit test `generateLinkCode` dan `handleUpdate('/start code')`.
- [ ] Tambahkan unit test Telegram listener untuk memastikan semua template variable tersedia.

Verifikasi:

- [ ] Manual Telegram link dengan code baru.
- [ ] Manual assign ticket menghasilkan message dengan subject.

### F-09 - P1 - Frontend permission policy tersebar dan hook admin-only tetap dipanggil non-admin

Status: Open
Area: Frontend architecture, authorization UX, data fetching boundary

Bukti:

- `frontend/src/App.tsx:44-87` route roles didefinisikan langsung di route.
- `frontend/src/layout/Sidebar.tsx:6-67` nav roles didefinisikan ulang.
- `frontend/src/pages/MyAccountPage.tsx:39-46` semua hook Telegram, termasuk admin config/check/test/update, dipanggil sebelum guard UI.
- `frontend/src/pages/MyAccountPage.tsx:236-239` UI Telegram baru dibatasi `user?.role === 'Admin'` saat render.
- `frontend/src/hooks/use-telegram.ts:58-65` `useTelegramConfig` tidak memiliki opsi `enabled`.

Root cause:

Policy role tidak punya single source of truth. Hook data fetching diletakkan di parent page sehingga tetap berjalan walau section admin tidak dirender.

Dampak:

- EndUser/ITSupport bisa memicu request 403 ke endpoint admin-only.
- Role policy mudah drift antara route, navigation, dan action button.
- Sulit mengaudit siapa boleh melakukan aksi apa di frontend.

Checklist fix:

- [ ] Buat `frontend/src/auth/permissions.ts` berisi `canViewDashboard`, `canManageUsers`, `canManageMasterData`, `canManageMaintenance`, `canManageTelegram`, `canAssignTicket`, dan action lain.
- [ ] Buat route/nav config tunggal dan gunakan untuk `App.tsx` serta `Sidebar.tsx`.
- [ ] Pisahkan `AdminTelegramSection` sebagai component child yang hanya dirender jika `canManageTelegram(user)`.
- [ ] Tambahkan opsi `enabled` pada hook Telegram admin: `useTelegramConfig({ enabled })`, `useCheckTelegram`, jika query diperlukan.
- [ ] Pastikan hook personal Telegram status hanya dipakai jika fitur memang tersedia untuk role tersebut. Saat ini dokumen menyatakan Telegram section Admin-only.
- [ ] Tambah test/render check bahwa non-admin My Account tidak memanggil `/telegram/config`.

Verifikasi:

- [ ] Frontend build.
- [ ] Browser devtools untuk EndUser/ITSupport tidak menunjukkan request admin Telegram.
- [ ] Route dan sidebar tetap konsisten untuk Admin, ITSupport, EndUser.

### F-10 - P2 - Notification unread count memakai Zustand untuk server-derived state

Status: Open
Area: Frontend state architecture, realtime consistency

Bukti:

- `backend/src/notifications/notifications.controller.ts:36-40` sudah ada `GET /notifications/unread-count`.
- `frontend/src/hooks/use-notifications.ts:7-25` unread dihitung dari halaman notification yang sedang diload.
- `frontend/src/hooks/use-notifications.ts:11` query key hanya `['notifications', page]`, tidak menyertakan `limit`.
- `frontend/src/layout/Navbar.tsx:21` badge membaca `unreadCount` dari Zustand.
- `frontend/src/layout/Navbar.tsx:31-36` dropdown punya query notification sendiri untuk limit 5.

Root cause:

Unread count adalah server-derived state, tetapi disimpan dan dimutasi manual di Zustand. Backend sudah menyediakan source of truth, tetapi frontend belum menggunakannya.

Dampak:

- Badge bisa salah jika unread lebih banyak dari halaman pertama.
- Badge bisa salah saat limit berubah atau dropdown query berbeda dari page query.
- Realtime notification sulit dibuat konsisten.

Checklist fix:

- [ ] Buat hook `useUnreadNotificationCount()` yang memanggil `/notifications/unread-count`.
- [ ] Gunakan TanStack Query sebagai source of truth untuk badge.
- [ ] Include semua parameter di query key, minimal `['notifications', page, limit, unreadOnly]`.
- [ ] Setelah mark read/read all/clear all, invalidate `['notifications']` dan `['notifications', 'unread-count']`.
- [ ] Jika WebSocket dipakai, update query cache TanStack Query, bukan Zustand persisted/manual state.
- [ ] Pertimbangkan hapus `notification-store.ts` atau gunakan hanya untuk ephemeral UI event.

Verifikasi:

- [ ] Manual: buat lebih dari 20 unread notification dan badge tetap benar.
- [ ] Manual: mark one/read all/clear all memperbarui badge dan dropdown.

### F-11 - P2 - Pagination `All` frontend tidak kompatibel dengan DTO backend

Status: Open
Area: API/UI contract

Bukti:

- `frontend/src/components/ui/Pagination.tsx:12-18` menyediakan opsi `All` dengan value `0`.
- `frontend/src/components/tickets/TicketList.tsx:240-248` memperlakukan `limit <= 0` sebagai all.
- `backend/src/tickets/dto/query-ticket.dto.ts:21-26` memvalidasi `limit` dengan `@Min(1)` dan `@Max(100)`.
- `backend/src/tickets/tickets.service.ts:139-140` sebenarnya mendukung `limit <= 0`, tetapi request akan ditolak DTO sebelum mencapai service.

Root cause:

UI dan service pernah mendukung konsep all, tetapi DTO API contract tidak ikut berubah.

Dampak:

- User memilih `All` akan menerima 400 validation error.
- Contract pagination tidak jelas untuk endpoint lain.

Checklist fix:

- [ ] Pilih salah satu: hapus opsi `All` dari frontend atau tambahkan kontrak eksplisit `all=true`.
- [ ] Rekomendasi untuk data ticket: jangan gunakan unbounded all; pakai max limit 100 atau export CSV untuk semua data.
- [ ] Jika tetap perlu all untuk admin kecil, gunakan `all=true` dengan role guard dan server-side cap.
- [ ] Update `Pagination` agar reusable sesuai kontrak backend.
- [ ] Tambah test DTO/query untuk limit.

Verifikasi:

- [ ] Manual pilih semua opsi pagination di ticket list.
- [ ] Backend validation test untuk invalid limit.

### F-12 - P2 - Maintenance banner memakai admin-domain endpoint, bukan public health contract

Status: Open
Area: Frontend architecture, maintenance mode UX

Bukti:

- `AGENTS.md:123-125` menyatakan `MaintenanceBanner` polling `/api/health` setiap 5 detik dan health berisi maintenance status.
- `frontend/src/components/MaintenanceBanner.tsx:1-6` memakai `useMaintenanceMode()`.
- `frontend/src/hooks/use-maintenance.ts:5-13` `useMaintenanceMode()` polling `/maintenance/mode`.
- `backend/src/health/health.controller.ts:44-49` health response sudah mengandung `maintenance`.
- `frontend/src/lib/axios.ts:39-89` belum punya handling global khusus untuk `503 MAINTENANCE`.

Root cause:

Hook maintenance admin dan public banner digabung. Axios belum menerjemahkan error maintenance ke UX global.

Dampak:

- Public/global UX bergantung pada endpoint domain maintenance, bukan health yang memang dibuat untuk public status.
- Saat API lain mengembalikan 503 maintenance, user flow bisa hanya melihat error biasa.

Checklist fix:

- [ ] Buat hook `useHealth()` atau `usePublicMaintenanceStatus()` yang memanggil `/health`.
- [ ] Ubah `MaintenanceBanner` memakai health maintenance status.
- [ ] Biarkan `useMaintenanceMode()` khusus Admin Maintenance UI.
- [ ] Tambahkan axios interceptor untuk error `{ code: 'MAINTENANCE' }` agar UI bisa tampilkan banner/toast konsisten.
- [ ] Pastikan endpoint auth/health/maintenance tetap sesuai allowlist guard.

Verifikasi:

- [ ] Manual enable maintenance sebagai Admin, lalu cek banner muncul untuk user non-admin.
- [ ] Manual request API non-admin saat maintenance menghasilkan UX yang jelas dan tidak logout palsu.

### F-13 - P1/P2 - Infra config drift: env, upload limit, headers, image, dan builder volume

Status: Open
Area: Deployment architecture, security headers, operations

Bukti:

- `.env.example:4-10` root env tidak menyertakan `REDIS_PASSWORD`, tetapi `NODE_ENV=production` di `.env.example:30`.
- `docker-compose.yml:87-90` Redis selalu dijalankan dengan `--requirepass "$REDIS_PASSWORD"`.
- `backend/src/main.ts:18-30` production mewajibkan `REDIS_PASSWORD`.
- `.env.example:10` memakai weak placeholder `change-this-to-random-secret`, tetapi `backend/src/main.ts:20` weak list belum memasukkan string ini.
- `nginx/nginx.conf:46` `client_max_body_size 10m`.
- `backend/src/comments/comments.controller.ts` mengizinkan 3 file per comment dengan batas 5 MB masing-masing, sehingga payload valid bisa sekitar 15 MB.
- `nginx/nginx.conf:35-38` hanya set beberapa header dasar untuk SPA static.
- `backend/src/main.ts:39` Helmet hanya berlaku di response API NestJS, bukan static HTML/assets dari Nginx.
- `docker-compose.yml:42`, `docker-compose.yml:70`, dan `docker-compose.yml:87` memakai env file yang sama untuk API, DB, dan Redis.
- `frontend/.env.example:1` mendokumentasikan `VITE_API_URL`, tetapi `frontend/src/lib/axios.ts:5-7` hardcode `baseURL: '/api'`.
- `docker-compose.yml:3-9` frontend builder copy dist ke volume tanpa membersihkan file lama.
- `backend/Dockerfile:1,18`, `frontend/Dockerfile:1,17`, `docker-compose.yml:17,66,85` memakai image tag floating major/minor.

Root cause:

Local dev compose, production-like env, dan deployment docs bercampur. Beberapa klaim security ada di API layer, sementara SPA dilayani langsung oleh Nginx.

Dampak:

- Quickstart bisa gagal start jika env production digunakan tanpa `REDIS_PASSWORD`.
- Upload comment valid bisa ditolak Nginx sebelum mencapai backend.
- Static SPA tidak mendapatkan header setara Helmet.
- Secrets app tersebar ke container yang tidak membutuhkan.
- Asset stale bisa tertinggal di `frontend_dist`.

Checklist fix:

- [ ] Pisahkan root env contoh local dan production.
- [ ] Tambahkan `REDIS_PASSWORD` dan `REDIS_URL=redis://:${REDIS_PASSWORD}@cache:6379` untuk production compose.
- [ ] Naikkan `client_max_body_size` minimal 16-20 MB atau turunkan batas comment upload agar total request <= 10 MB.
- [ ] Tambahkan security headers static di Nginx, termasuk CSP yang cocok untuk React/Vite, dan HSTS hanya untuk HTTPS production.
- [ ] Tambahkan `server_tokens off` di Nginx.
- [ ] Split env per service atau gunakan Docker secrets: DB hanya `POSTGRES_*`, Redis hanya `REDIS_PASSWORD`, API hanya app secrets.
- [ ] Gunakan `import.meta.env.VITE_API_URL ?? '/api'` di frontend axios dan refresh path.
- [ ] Bersihkan `/export` sebelum copy dist, atau ganti pola menjadi final Nginx image tanpa long-running builder container.
- [ ] Pin image tag patch/digest dan tambahkan image scanning di CI.

Verifikasi:

- [ ] `docker compose config` valid untuk local env.
- [ ] Upload 3 file 5 MB di comment melewati Nginx dan backend sesuai keputusan batas.
- [ ] Curl static `/` menunjukkan header security yang diharapkan.
- [ ] Rebuild frontend tidak menyisakan asset lama di volume.

### F-14 - P2 - Backup CLI drift dari Admin UI dan dokumentasi restore terlalu optimistis

Status: Open
Area: Operational architecture, backup/restore

Bukti:

- `scripts/backup.sh:21-31` membuat backup tanpa trap cleanup jika salah satu command gagal.
- `scripts/backup.sh:24` `pg_dump` CLI tidak memakai `--schema`, sedangkan docs menyebut dump public schema.
- `backend/src/maintenance/maintenance.service.ts:95-107` Admin UI backup punya flow lebih lengkap, termasuk schema-aware pg_dump dan cleanup pada error.
- `backend/src/maintenance/maintenance.service.ts:118-124` Admin UI menghapus folder backup parsial saat gagal.
- `ARCHITECTURE.md:473` mengklaim restore validasi symlink/hardlink abuse, tetapi implementasi `backend/src/maintenance/maintenance.service.ts:335-374` belum mengecek tipe entry.

Root cause:

Backup CLI dan Admin UI berkembang terpisah. Dokumentasi mengikuti intended design, bukan semua detail implementasi aktual.

Dampak:

- Backup CLI bisa meninggalkan folder parsial.
- Hasil dump CLI dan Admin UI tidak sepenuhnya sama.
- Operator bisa mengira restore archive sudah menolak symlink/hardlink padahal belum.

Checklist fix:

- [ ] Tambahkan `trap` cleanup di `scripts/backup.sh` untuk menghapus folder parsial saat gagal.
- [ ] Tambahkan `umask 077` agar backup file tidak world-readable.
- [ ] Samakan opsi `pg_dump` CLI dengan Admin UI, termasuk `--schema public` atau schema dari env.
- [ ] Tambahkan lock/anti-concurrent untuk CLI jika bisa memakai Redis atau file lock.
- [ ] Dokumentasikan bahwa backup harus dipindahkan off-host dan dienkripsi untuk production.
- [ ] Update docs restore agar tidak mengklaim symlink/hardlink aman sebelum F-06 selesai.

Verifikasi:

- [ ] Simulasikan failure `pg_dump` dan pastikan folder parsial dibersihkan.
- [ ] Bandingkan manifest/dump dari CLI dan Admin UI.

### F-15 - P2 - Test architecture belum menutup boundary kritikal

Status: Open
Area: Testability, regression safety

Bukti:

- `backend/src/**/*.spec.ts` hanya menemukan `backend/src/tickets/tickets.service.spec.ts`.
- README menyebut unit test utama hanya untuk TicketsService.
- Area kritikal seperti auth refresh/revocation, maintenance guard/filter, attachment visibility, Telegram link, notification count, dan restore lock belum terlihat punya coverage.

Root cause:

Testing belum disusun berdasarkan boundary risiko. Test yang ada lebih fokus happy path ticket service.

Dampak:

- Perubahan arsitektur kontrak API, visibility, atau maintenance berisiko regresi tanpa sinyal cepat.
- Agent berikutnya bisa refactor terlalu besar tanpa guardrail.

Checklist fix:

- [ ] Tambah test `HttpExceptionFilter` untuk validation, forbidden, not found, maintenance, dan unknown 500.
- [ ] Tambah test `TransformInterceptor` atau e2e contract untuk success envelope.
- [ ] Tambah test attachment visibility EndUser/ITSupport/Admin.
- [ ] Tambah test auth refresh: Redis TTL, revoke on logout, revoke all on password change/user deactivate/delete.
- [ ] Tambah test Telegram link code length dan event payload completeness.
- [ ] Tambah test SLA lock atomic dengan mock Redis.
- [ ] Tambah test maintenance restore lock dan tar archive validation.
- [ ] Tambah frontend tests jika test framework ditambahkan: permission rendering, API unwrap adapter, unread count hook.

Verifikasi:

- [ ] `npm test` backend hijau.
- [ ] Frontend build tetap hijau.

### F-16 - P3 - Dokumentasi drift dan perlu dirawat setelah fix

Status: Open
Area: Documentation, agent handoff

Bukti:

- `README.md:163-183` memiliki pengulangan struktur frontend `auth/layout/components`.
- `AGENTS.md:123` menyatakan `MaintenanceBanner` polls `/api/health`, tetapi implementasi memakai `/maintenance/mode`.
- `ARCHITECTURE.md:473` menyebut restore validasi symlink/hardlink, tetapi implementasi belum sejauh itu.
- `ARCHITECTURE.md:483` menyebut Docker healthcheck container killed/restarted setelah gagal; Docker Compose standar hanya menandai unhealthy dan tidak otomatis restart karena healthcheck saja.
- `README.md:227` menyebut HTTP local, sementara `.env.example:19` memakai HTTPS origin.

Root cause:

Dokumentasi diperbarui bersamaan dengan intended state, tetapi beberapa implementasi belum menyusul atau berubah setelahnya.

Dampak:

- Agent baru bisa mengikuti asumsi salah.
- Operator bisa salah memahami deployment dan restore safety.

Checklist fix:

- [ ] Setelah F-01 sampai F-14 dikerjakan, update `AGENTS.md`, `README.md`, dan `ARCHITECTURE.md` sesuai implementasi aktual.
- [ ] Tandai jelas local HTTP vs production HTTPS.
- [ ] Koreksi klaim Docker healthcheck.
- [ ] Koreksi maintenance banner flow sesuai keputusan F-12.
- [ ] Hapus duplikasi struktur frontend di README.
- [ ] Tambahkan section "Architecture Decisions" singkat untuk pengecualian seperti HealthController boleh inject Prisma langsung.

Verifikasi:

- [ ] Agent baru bisa membaca `AGENTS.md` dan menjalankan quickstart tanpa bertanya asumsi dasar.
- [ ] Dokumentasi tidak mengklaim safety yang belum ada di code.

## Urutan Implementasi Disarankan

### Phase 0 - Safety dan kontrak kritikal

- [ ] Kerjakan F-01 attachment visibility.
- [ ] Kerjakan F-02 error code dan response envelope decision.
- [ ] Tambah test minimal untuk F-01 dan F-02 sebelum refactor lain.

### Phase 1 - Client/API boundary

- [ ] Buat frontend API unwrap adapter.
- [ ] Update hooks secara bertahap per domain.
- [ ] Kerjakan F-09 permission registry dan Admin Telegram hook gating.
- [ ] Kerjakan F-10 unread count dan F-11 pagination contract.

### Phase 2 - Operasional dan scaling

- [ ] Kerjakan F-05 multi-instance readiness.
- [ ] Kerjakan F-06 storage/restore lock.
- [ ] Kerjakan F-07 auth duration/cookie config.
- [ ] Kerjakan F-13 dan F-14 infra/backup drift.

### Phase 3 - Refactor struktur

- [ ] Kerjakan F-03 module/repository boundary.
- [ ] Kerjakan F-04 service/component extraction.
- [ ] Kerjakan F-16 dokumentasi.

## Catatan untuk Agent AI Sesi Berikutnya

Baca ini sebelum mengubah code:

- Mulai dari `AGENTS.md`. Aturan non-negotiable paling penting: jangan persist access token, jangan expose EndUser ke dashboard/admin/internal comments/attachments, jangan hardcode fallback secret, jangan ubah Docker HTTP/HTTPS flow tanpa diminta.
- Worktree mungkin dirty. Jangan revert perubahan user. Fokus hanya file yang relevan dengan temuan yang sedang dikerjakan.
- Untuk backend bug, ikuti jalur controller -> service -> repository. Jika menambah service baru, inject repository, bukan `PrismaService`, kecuali operational exception yang disetujui.
- Jangan refactor besar sebelum test/regression untuk area itu ada. Minimal untuk F-01 dan F-02, tulis test dulu atau bersamaan.
- Jika mengerjakan response envelope F-02, koordinasikan backend dan frontend dalam satu perubahan logis. Partial rollout akan memecahkan auth/hooks.
- Jika mengerjakan F-01, cari semua akses attachment dari ticket detail, attachment endpoint, comment include, download, dan count. Jangan hanya patch satu query.
- Jika mengerjakan infra, jangan jalankan `docker compose down -v`. Gunakan build/start sesuai `AGENTS.md`.
- Jika mengerjakan maintenance/restore, treat sebagai destructive operation. Tambah test dan jangan menjalankan restore real tanpa konfirmasi manusia.

Rekomendasi entry point per temuan:

- F-01: `backend/src/tickets/tickets.service.ts`, `backend/src/attachments/attachments.service.ts`, repository attachment/ticket, tests ticket/attachment visibility.
- F-02: `backend/src/common/interceptors/transform.interceptor.ts`, `backend/src/common/filters/http-exception.filter.ts`, `backend/src/app.module.ts`, `frontend/src/lib/axios.ts`, semua `frontend/src/hooks`.
- F-05: `backend/src/notifications/notifications.gateway.ts`, `backend/src/telegram/telegram.service.ts`, `backend/src/sla/sla.service.ts`, `backend/src/redis/redis.service.ts`.
- F-06: `backend/src/attachments/attachments.service.ts`, `backend/src/tickets/tickets.service.ts`, `backend/src/maintenance/maintenance.service.ts`.
- F-09: `frontend/src/App.tsx`, `frontend/src/layout/Sidebar.tsx`, `frontend/src/pages/MyAccountPage.tsx`, `frontend/src/hooks/use-telegram.ts`.
- F-13: `.env.example`, `backend/.env.example`, `docker-compose.yml`, `nginx/nginx.conf`, `frontend/src/lib/axios.ts`, Dockerfiles.

Verification commands dari `AGENTS.md`:

- Backend unit tests: `cd backend && npm test`
- Backend build: `cd backend && npm run build`
- Frontend build: `cd frontend && npm run build`
- Frontend lint: `cd frontend && npm run lint`
- Compose build API: `docker compose build api`
- Compose build frontend: `docker compose build frontend`

Jangan deklarasikan selesai jika verifikasi relevan belum hijau atau keterbatasannya belum dijelaskan.
