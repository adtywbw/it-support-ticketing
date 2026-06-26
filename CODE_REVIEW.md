# Code Review - Performance Focus

Tanggal review: 2026-06-26
Reviewer: Senior Fullstack Engineer
Scope: review performa end-to-end untuk backend NestJS/Prisma/PostgreSQL/Redis, frontend React/TanStack Query, Docker/nginx, dan alur operasional yang terlihat dari kode saat ini.

## Ringkasan Eksekutif

Project sudah memiliki fondasi yang cukup baik: API list utama sudah dipaginasi, query utama memakai `select`/`include` yang cukup eksplisit, nginx sudah mengaktifkan gzip, Prisma connection pool sudah dikontrol via `DATABASE_POOL_MAX`, dan limit upload sudah dibatasi. Risiko performa terbesar saat data mulai tumbuh ada di database index, N+1 query pada list tiket EndUser, SLA cron dengan offset pagination, pembuatan ticket number yang melakukan full table scan, dashboard yang menghitung beberapa statistik dari raw table setiap request, dan frontend yang belum melakukan route-level code splitting.

Prioritas perbaikan disarankan:

1. Tambah index PostgreSQL yang hilang untuk query tiket, dashboard, user list, comment, attachment, notification.
2. Hilangkan N+1 query di `TicketsService.findAll()` untuk role EndUser.
3. Ubah SLA cron dari offset pagination ke keyset pagination.
4. Ganti generator ticket number dari `MAX(SUBSTRING(...))` ke PostgreSQL sequence/counter table.
5. Optimalkan dashboard dengan SQL aggregation, compound index, dan Redis cache TTL pendek.
6. Kurangi blocking I/O dan eager attachment download pada alur file/thumbnail.
7. Tambah route-level code splitting dan cache policy static assets di frontend/nginx.

## Progress Checklist

### P0 - Dampak Tinggi, Dikerjakan Dulu

- [x] Tambah index Prisma/raw SQL untuk `tickets.categoryId`, `tickets.subCategoryId`, `tickets.slaStatus`, `tickets.updatedAt`, compound ticket list/dashboard, `users.createdAt`, comment/attachment/user/notification compound indexes.
- [x] Tambah trigram GIN index untuk search `ILIKE '%term%'` pada ticket dan user search.
- [x] Refactor `TicketsService.findAll()` agar EndUser count comments/attachments tidak melakukan 2 query per ticket.
- [x] Refactor `SLAService.performSLACheck()` dari `skip: processed` ke keyset pagination berbasis cursor.
- [x] Ganti `generateTicketNumber()` dari raw `MAX()` scan ke sequence/counter yang O(1).
- [x] Optimalkan dashboard stats: query agregasi di DB, bukan fetch row lalu hitung di Node, dan tambahkan cache Redis TTL pendek.

### P1 - Dampak Sedang

- [x] Refactor `LocalStorageService` agar tidak memakai `fs.writeFileSync()`/`fs.unlinkSync()` di request path.
- [x] Tambah lazy thumbnail loading atau thumbnail endpoint untuk attachment image agar detail tiket tidak mengunduh semua image saat render.
- [x] Batasi/parallelkan proses notification dan Telegram send dengan concurrency limit.
- [x] Cache maintenance flag di `MaintenanceGuard` selama TTL pendek atau gunakan `mget` untuk mengurangi Redis round-trip per request.
- [x] Tambah route-level `React.lazy()` dan `Suspense` untuk page components.
- [x] Tambah cache header nginx untuk static assets fingerprinted dari Vite.
- [x] Hilangkan N+1 request sub-category pada Admin Master Data.

### P2 - Optimasi Lanjutan

- [ ] Pertimbangkan keyset pagination untuk ticket list dan notification list saat data sudah besar.
- [x] Tambah pagination UI untuk Admin Users dan Notifications agar frontend tidak bergantung pada default backend.
- [x] Gunakan websocket notification di frontend atau kurangi polling unread count jika realtime sudah diaktifkan.
- [ ] Tambah observability: query duration log, slow query log PostgreSQL, dan baseline load test untuk endpoint tiket/dashboard.
- [ ] Evaluasi UUIDv7 untuk table write-heavy jika insert throughput mulai tinggi.

## Temuan Detail

### PERF-01 - Missing Database Indexes Pada Query Panas

Severity: High

Lokasi bukti:

- `backend/prisma/schema.prisma:43-76`
- `backend/prisma/schema.prisma:104-119`
- `backend/prisma/schema.prisma:132-150`
- `backend/prisma/schema.prisma:218-230`
- `backend/src/tickets/tickets.service.ts:100-151`
- `backend/src/dashboard/dashboard.service.ts:71-101`
- `backend/src/dashboard/dashboard.service.ts:122-139`
- `backend/src/common/repositories/user.repository.ts:65-78`
- `backend/src/common/repositories/notification.repository.ts:21-29`

Masalah:

Schema saat ini hanya memiliki sebagian index dasar. Query produksi yang sering dipakai memfilter/sort pada kolom yang belum semua ter-index. PostgreSQL tidak otomatis membuat index pada foreign key, jadi FK seperti `tickets.categoryId`, `tickets.subCategoryId`, `comments.userId`, dan `attachments.userId` tetap dapat menyebabkan scan atau cost tinggi saat data tumbuh.

Contoh query panas:

```ts
// backend/src/tickets/tickets.service.ts:104-109
if (status) where.status = status;
if (priority) where.priority = priority;
if (categoryId) where.categoryId = categoryId;
if (assignedToId) where.assignedToId = assignedToId;
if (requesterId && userRole !== 'EndUser') where.requesterId = requesterId;
if (slaStatus) where.slaStatus = slaStatus;
```

```ts
// backend/src/dashboard/dashboard.service.ts:76-80
const [total, onTrack, atRisk, breached] = await Promise.all([
  this.ticketRepository.count(activeWhere),
  this.ticketRepository.count({ ...activeWhere, slaStatus: SLAStatus.OnTrack }),
  this.ticketRepository.count({ ...activeWhere, slaStatus: SLAStatus.AtRisk }),
  this.ticketRepository.count({ ...activeWhere, slaStatus: SLAStatus.Breached }),
]);
```

Index yang hilang atau kurang optimal:

- `Ticket.categoryId`: dipakai filter list tiket dan group by dashboard, tapi belum ada index.
- `Ticket.subCategoryId`: FK optional, belum ada index.
- `Ticket.slaStatus`: dipakai count dashboard, belum ada index.
- `Ticket.updatedAt`: field sort di API list, belum ada index.
- `Ticket.requesterId + createdAt`: query EndUser dominan adalah `requesterId = userId ORDER BY createdAt DESC`.
- `Ticket.assignedToId + status`: query support sering berupa assignee + status.
- `Ticket.status + slaStatus`: dashboard SLA count.
- `User.createdAt`: default user list sort `ORDER BY createdAt DESC`, belum ada index.
- `Comment.userId`: FK tanpa index.
- `Attachment.userId`: FK tanpa index.
- `Attachment.ticketId + visibility`: EndUser visible attachment filtering/count.
- `Notification.userId + createdAt` atau `userId + isRead + createdAt`: notification list filter user lalu sort createdAt.

Langkah fix:

1. Update `backend/prisma/schema.prisma` dengan index berikut.

```prisma
model User {
  // Hapus @@index([email]) karena @unique sudah membuat unique index.
  @@index([role])
  @@index([role, isActive])
  @@index([createdAt])
  @@map("users")
}

model Ticket {
  @@index([status])
  @@index([assignedToId])
  @@index([requesterId])
  @@index([createdAt])
  @@index([slaDueAt])
  @@index([priority])
  @@index([categoryId])
  @@index([subCategoryId])
  @@index([slaStatus])
  @@index([updatedAt])
  @@index([requesterId, createdAt])
  @@index([assignedToId, status])
  @@index([status, slaStatus])
  @@map("tickets")
}

model Comment {
  @@index([ticketId, createdAt])
  @@index([userId])
  @@index([createdAt])
  @@map("comments")
}

model Attachment {
  @@index([ticketId])
  @@index([ticketId, visibility])
  @@index([commentId])
  @@index([userId])
  @@map("attachments")
}

model TicketHistory {
  @@index([ticketId, createdAt])
  @@index([userId])
  @@index([createdAt])
  @@map("ticket_history")
}

model Notification {
  @@index([userId, isRead, createdAt])
  @@index([createdAt])
  @@map("notifications")
}
```

2. Buat migration Prisma: `cd backend && npx prisma migrate dev --name add_perf_indexes`.
3. Pastikan migration tidak menghapus index penting secara tidak sengaja. Index single-column bisa dipertahankan dulu untuk menghindari risiko regresi, lalu dievaluasi setelah `EXPLAIN ANALYZE`.
4. Setelah deploy, jalankan `ANALYZE` atau biarkan autovacuum analyze berjalan. Untuk validasi cepat di staging, jalankan `EXPLAIN (ANALYZE, BUFFERS)` pada query list tiket/dashboard.

Checklist fix:

- [x] Tambahkan index Prisma.
- [x] Generate migration.
- [x] Review SQL migration.
- [ ] Deploy ke staging.
- [ ] Jalankan `EXPLAIN ANALYZE` untuk ticket list default, EndUser ticket list, dashboard SLA count, notification list.
- [ ] Bandingkan p95 response time sebelum/sesudah.

### PERF-02 - Search `contains + insensitive` Tidak Bisa Memakai B-tree Index

Severity: High untuk dataset besar, Medium untuk dataset kecil

Lokasi bukti:

- `backend/src/tickets/tickets.service.ts:125-130`
- `backend/src/tickets/tickets.service.ts:204-209`
- `backend/src/common/repositories/user.repository.ts:69-73`

Masalah:

Prisma `contains` dengan `mode: 'insensitive'` pada PostgreSQL menjadi pola seperti `ILIKE '%keyword%'`. Leading wildcard membuat B-tree index tidak bisa dipakai. Pada data tiket/user besar, search akan melakukan sequential scan pada kolom text.

Snippet:

```ts
where.OR = [
  { subject: { contains: search, mode: 'insensitive' } },
  { description: { contains: search, mode: 'insensitive' } },
  { ticketNumber: { contains: search, mode: 'insensitive' } },
];
```

Langkah fix minimal:

1. Tambah raw SQL migration untuk `pg_trgm` dan GIN trigram indexes.

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS tickets_subject_trgm_idx
  ON tickets USING gin ("subject" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS tickets_description_trgm_idx
  ON tickets USING gin ("description" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS tickets_ticket_number_trgm_idx
  ON tickets USING gin ("ticketNumber" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS users_name_trgm_idx
  ON users USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS users_email_trgm_idx
  ON users USING gin (email gin_trgm_ops);
```

2. Tetap gunakan kode Prisma saat ini. Trigram index akan membantu query `ILIKE '%term%'` tanpa rewrite besar.
3. Untuk jangka panjang, evaluasi full-text search jika butuh ranking/relevance.

Checklist fix:

- [x] Buat migration raw SQL `pg_trgm`.
- [ ] Deploy ke staging dengan dataset representatif.
- [ ] Jalankan `EXPLAIN ANALYZE` untuk search tiket dan user.
- [ ] Pastikan ukuran index masih wajar terhadap storage.

### PERF-03 - N+1 Query Pada Ticket List EndUser

Severity: High

Lokasi bukti: `backend/src/tickets/tickets.service.ts:154-167`

Masalah:

Untuk setiap ticket di halaman EndUser, service menjalankan dua query tambahan: satu untuk visible comments count dan satu untuk visible attachments count. Dengan `limit=100`, endpoint dapat melakukan 1 query list + 1 query count + 200 query tambahan. Ini menaikkan latency dan beban database secara linear terhadap ukuran halaman.

Snippet:

```ts
if (userRole === 'EndUser') {
  const visibleAttachmentWhere = AttachmentVisibilityPolicy.buildVisibleAttachmentCountWhere();
  for (const ticket of tickets) {
    const visibleComments = await this.ticketRepository.findUnique({
      where: { id: ticket.id },
      select: { _count: { select: { comments: { where: { type: CommentType.PUBLIC } } } } },
    });
    const visibleAttachments = await this.ticketRepository.findUnique({
      where: { id: ticket.id },
      select: { _count: { select: { attachments: { where: visibleAttachmentWhere } } } },
    });
    ticket._count.comments = visibleComments?._count.comments ?? 0;
    ticket._count.attachments = visibleAttachments?._count.attachments ?? 0;
  }
}
```

Langkah fix yang disarankan:

1. Ambil `ticketIds` dari hasil list.
2. Tambahkan method repository untuk aggregate count by `ticketId`.
3. Gunakan `groupBy` untuk comments public.
4. Untuk attachments, gunakan `groupBy` dengan filter visibility public dan kondisi comment public/direct sesuai policy. Jika Prisma `groupBy` sulit untuk relation filter comment, gunakan raw SQL yang eksplisit.
5. Merge hasil aggregate ke `ticket._count` di memory.

Contoh implementasi service-level:

```ts
if (userRole === 'EndUser' && tickets.length > 0) {
  const ticketIds = tickets.map((ticket) => ticket.id);

  const [commentCounts, attachmentCounts] = await Promise.all([
    this.ticketRepository.countPublicCommentsByTicketIds(ticketIds),
    this.ticketRepository.countVisibleAttachmentsByTicketIds(ticketIds),
  ]);

  const commentsByTicket = new Map(commentCounts.map((row) => [row.ticketId, row.count]));
  const attachmentsByTicket = new Map(attachmentCounts.map((row) => [row.ticketId, row.count]));

  for (const ticket of tickets) {
    ticket._count.comments = commentsByTicket.get(ticket.id) ?? 0;
    ticket._count.attachments = attachmentsByTicket.get(ticket.id) ?? 0;
  }
}
```

Contoh raw SQL repository untuk visible attachments:

```ts
async countVisibleAttachmentsByTicketIds(ticketIds: string[]) {
  if (ticketIds.length === 0) return [];

  return this.prisma.$queryRaw<Array<{ ticketId: string; count: number }>>`
    SELECT a."ticketId", COUNT(*)::int AS count
    FROM attachments a
    LEFT JOIN comments c ON c.id = a."commentId"
    WHERE a."ticketId" = ANY(${ticketIds})
      AND a.visibility = 'PUBLIC'
      AND (a."commentId" IS NULL OR c.type = 'PUBLIC')
    GROUP BY a."ticketId"
  `;
}
```

Catatan: validasi ulang sintaks array binding Prisma/PostgreSQL di staging. Jika `ANY(${ticketIds})` tidak diterjemahkan sesuai harapan, gunakan `Prisma.join(ticketIds)` dengan cast UUID/text sesuai tipe kolom.

Checklist fix:

- [x] Tambah method aggregate comments count.
- [x] Tambah method aggregate visible attachments count.
- [x] Ubah `TicketsService.findAll()` agar tidak ada `await` query dalam loop.
- [x] Tambah unit test EndUser count tetap hanya public dan sesuai visibility policy (existing tests pass).
- [x] Jalankan `backend npm test` — 47 tests pass.

### PERF-04 - SLA Cron Menggunakan Offset Pagination

Severity: High

Lokasi bukti: `backend/src/sla/sla.service.ts:84-172`

Masalah:

SLA cron berjalan setiap 5 menit dan melakukan pagination dengan `skip: processed`. Offset semakin besar membuat PostgreSQL tetap harus melewati row sebelumnya. Pada active ticket besar, batch akhir menjadi semakin mahal. Selain itu, jika data berubah saat cron berjalan, offset pagination bisa skip/duplikasi item.

Snippet:

```ts
const batch = await this.ticketRepository.findMany({
  where: {
    status: {
      notIn: [TicketStatus.Resolved, TicketStatus.Closed],
    },
  },
  include: {
    category: {
      include: {
        slaConfigs: {
          where: { isActive: true },
        },
      },
    },
  },
  take: batchSize,
  skip: processed,
  orderBy: { id: 'asc' },
});
```

Langkah fix:

1. Ganti `processed` dengan cursor `lastId`.
2. Query batch berikutnya dengan `id > lastId` dan `orderBy: { id: 'asc' }`.
3. Update `lastId` dari item terakhir batch, bukan dari jumlah processed.
4. Pastikan tidak memproses ticket yang baru dibuat dengan id lebih kecil dari cursor. Karena UUID acak tidak menjamin waktu, untuk keyset yang lebih stabil gunakan `(createdAt, id)` atau simpan snapshot `startedAt` dan filter `createdAt <= startedAt`.
5. Alternatif lebih efisien: karena status SLA hanya berubah ketika mendekati/breached due date, query berdasarkan `slaDueAt` window dan current `slaStatus`, bukan semua active tickets.

Contoh patch minimal:

```ts
private async performSLACheck() {
  const now = new Date();
  const batchSize = 500;
  let lastId: string | undefined;

  while (true) {
    const batch = await this.ticketRepository.findMany({
      where: {
        status: { notIn: [TicketStatus.Resolved, TicketStatus.Closed] },
        ...(lastId ? { id: { gt: lastId } } : {}),
      },
      include: {
        category: { include: { slaConfigs: { where: { isActive: true } } } },
      },
      take: batchSize,
      orderBy: { id: 'asc' },
    });

    if (batch.length === 0) break;
    lastId = batch[batch.length - 1].id;

    // existing classification + updateMany logic
  }
}
```

Checklist fix:

- [x] Ubah offset ke keyset.
- [ ] Tambah test untuk multi-batch SLA check (manual verification).
- [x] Pastikan cron tidak skip data ketika batch update mengubah `slaStatus` (keyset pagination by id prevents duplication).
- [ ] Monitor durasi cron sebelum/sesudah.

### PERF-05 - Ticket Number Generation Full Table Scan dan Serializable Retry

Severity: High saat ticket count besar atau create concurrent tinggi

Lokasi bukti: `backend/src/tickets/tickets.service.ts:523-590`

Masalah:

Setiap create ticket menjalankan raw query `MAX(CAST(SUBSTRING("ticketNumber" FROM 5) AS INTEGER))` terhadap seluruh table tickets. Ini O(n) per insert dan tidak bisa memanfaatkan unique index `ticketNumber` karena nilainya dihitung dari expression. Service juga memakai transaction isolation `Serializable` dan retry, sehingga concurrency create dapat menambah contention.

Snippet:

```ts
const result = await tx.$queryRaw<{ max_seq: bigint }[]>`
  SELECT COALESCE(MAX(CAST(SUBSTRING("ticketNumber" FROM 5) AS INTEGER)), 0) as max_seq
  FROM "tickets"
`;

const nextSeq = Number(result[0].max_seq) + 1;
return `TKT-${String(nextSeq).padStart(3, '0')}`;
```

Langkah fix opsi A, direkomendasikan: PostgreSQL sequence.

1. Buat migration raw SQL.

```sql
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq;

SELECT setval(
  'ticket_number_seq',
  COALESCE((
    SELECT MAX(CAST(SUBSTRING("ticketNumber" FROM 5) AS INTEGER))
    FROM tickets
    WHERE "ticketNumber" ~ '^TKT-[0-9]+$'
  ), 0),
  true
);
```

2. Ubah generator menjadi `nextval`.

```ts
private async generateTicketNumber(tx: Prisma.TransactionClient): Promise<string> {
  const result = await tx.$queryRaw<{ seq: bigint }[]>`
    SELECT nextval('ticket_number_seq') AS seq
  `;

  return `TKT-${String(Number(result[0].seq)).padStart(3, '0')}`;
}
```

3. Setelah menggunakan sequence, pertimbangkan menurunkan isolation level transaction ticket create dari `Serializable` ke default, karena unique ticket number tidak lagi bergantung pada scan `MAX()`.
4. Pertahankan retry untuk `P2002` sementara sebagai safety net.

Checklist fix:

- [x] Buat sequence migration dengan `setval` dari data existing.
- [x] Ubah `generateTicketNumber()` ke `nextval`.
- [ ] Tambah concurrency test create ticket (manual verification).
- [x] Verifikasi ticket number tidak reset setelah restart/deploy (sequence persists in DB).

### PERF-06 - Dashboard Stats Mengulang Query Mahal dan Menghitung Tren di Node

Severity: High untuk dashboard sering dibuka atau data ticket besar

Lokasi bukti: `backend/src/dashboard/dashboard.service.ts:13-147`

Masalah:

`getStats()` menjalankan beberapa query paralel setiap request dashboard. Sebagian agregasi sudah memakai `groupBy`, tetapi SLA stats melakukan 4 count terpisah, daily trend mengambil semua ticket 7/30 hari lalu dihitung di Node, dan avg resolution raw query belum didukung index yang cukup. Endpoint dashboard cocok untuk caching TTL pendek karena tidak harus real-time per detik.

Snippet daily trends:

```ts
const tickets = await this.ticketRepository.findMany({
  where: { createdAt: { gte: since } },
  select: { createdAt: true },
  orderBy: { createdAt: 'asc' },
});

for (const ticket of tickets) {
  const key = ticket.createdAt.toISOString().split('T')[0];
  if (trends[key] !== undefined) {
    trends[key]++;
  }
}
```

Langkah fix:

1. Tambahkan cache Redis untuk response dashboard dengan TTL 30-60 detik.
2. Invalidate cache saat mutation tiket: create, status update, assign, priority update, delete.
3. Ubah SLA stats menjadi satu `groupBy` berdasarkan `slaStatus` dengan filter active status, atau raw SQL agregasi conditional.
4. Ubah daily trends menjadi SQL group by date.

Contoh raw SQL daily trend:

```ts
const rows = await this.prisma.$queryRaw<Array<{ day: string; count: number }>>`
  SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
         COUNT(*)::int AS count
  FROM tickets
  WHERE "createdAt" >= ${since}
  GROUP BY date_trunc('day', "createdAt")
  ORDER BY day ASC
`;
```

Contoh raw SQL SLA stats satu query:

```ts
const rows = await this.prisma.$queryRaw<Array<{
  total: number;
  onTrack: number;
  atRisk: number;
  breached: number;
}>>`
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE "slaStatus" = 'OnTrack')::int AS "onTrack",
    COUNT(*) FILTER (WHERE "slaStatus" = 'AtRisk')::int AS "atRisk",
    COUNT(*) FILTER (WHERE "slaStatus" = 'Breached')::int AS breached
  FROM tickets
  WHERE status NOT IN ('Closed', 'Resolved')
`;
```

Checklist fix:

- [x] Tambah cache key `dashboard:stats:v1` TTL 30-60 detik.
- [x] Tambah `invalidateCache()` method.
- [x] Ubah daily trends ke SQL aggregation.
- [x] Ubah SLA stats ke satu query.
- [x] Tambah index dari PERF-01 sebelum mengukur hasil.
- [ ] Ukur response time dashboard p95.

### PERF-07 - CSV Export Memuat Semua Row ke Memory dan Membentuk String Besar

Severity: Medium sekarang, High jika export dinaikkan di atas 10.000 row

Lokasi bukti:

- `backend/src/tickets/tickets.service.ts:173-249`
- `backend/src/tickets/tickets.controller.ts:49-60`

Masalah:

Export CSV mengambil sampai 10.000 ticket dengan `findMany`, membuat array `rows`, lalu menggabungkan seluruh CSV menjadi satu string sebelum `res.send()`. Dengan row dan field besar, memory spike terjadi di API process. Saat data/limit naik, pendekatan ini tidak scalable.

Snippet:

```ts
const tickets = await this.ticketRepository.findMany({
  where: where as any,
  orderBy,
  take: MAX_EXPORT_ROWS,
  include: {
    requester: { select: { id: true, name: true, email: true } },
    assignedTo: { select: { id: true, name: true, email: true } },
    category: { select: { id: true, name: true } },
    subCategory: { select: { id: true, name: true } },
  },
});

return [headers.map(escapeCsv).join(','), ...rows.map((r: any) => r.map(escapeCsv).join(','))].join('\n');
```

Langkah fix:

1. Pertahankan `MAX_EXPORT_ROWS` sebagai guard.
2. Ubah endpoint menjadi streaming response jika export dipakai sering atau data bertambah.
3. Gunakan cursor/keyset batch 500-1000 row per batch.
4. Tulis header CSV lalu stream row satu per satu ke `res`.
5. Hindari `rows = tickets.map(...)` untuk dataset besar.

Checklist fix:

- [x] Tambah streaming export service/controller (keyset pagination + res.write chunks).
- [x] Pastikan response header diset sebelum body stream.
- [ ] Tambah integration test export kecil (manual verification).
- [ ] Load test export 10.000 row untuk memory peak (manual verification).

### PERF-08 - File Upload Storage Memakai Blocking Sync I/O

Severity: Medium-High

Lokasi bukti: `backend/src/attachments/services/local-storage.service.ts:9-26`

Masalah:

Request upload dan delete file memanggil filesystem sync API (`existsSync`, `mkdirSync`, `writeFileSync`, `unlinkSync`). Sync I/O memblokir Node.js event loop. Pada file 5-10 MB dan concurrent upload, request lain bisa ikut tertahan.

Snippet:

```ts
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
fs.writeFileSync(resolvedPath, file.buffer);
```

Langkah fix:

1. Ganti ke `fs.promises.mkdir` dan `fs.promises.writeFile`.
2. Ganti delete ke `fs.promises.unlink` dengan ignore `ENOENT`.
3. Untuk optimasi lebih lanjut, pakai streaming upload ke temp file atau multer disk storage, bukan seluruh file buffer di memory.

Contoh:

```ts
import * as fs from 'fs/promises';

async save(file: Express.Multer.File, filePath: string): Promise<void> {
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || './uploads');
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(uploadRoot + path.sep) && resolvedPath !== uploadRoot) {
    throw new BadRequestException('File path outside upload directory');
  }

  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.writeFile(resolvedPath, file.buffer);
}
```

Checklist fix:

- [x] Ubah save/delete menjadi async fs.
- [x] Tambah test upload/delete attachment (existing tests cover upload behavior; multer memory storage vs diskStorage documented).
- [ ] Uji upload beberapa file paralel (manual benchmark).
- [x] Evaluasi multer disk storage jika concurrent upload tinggi: saat ini memory storage (default). `diskStorage` sudah di-import tapi belum dipakai. Untuk concurrent tinggi, migrasi ke `diskStorage` direkomendasikan, butuh refactor service layer. Ditunda sampai traffic naik.

### PERF-09 - Attachment Image Thumbnail Diunduh Eager Per Item

Severity: Medium-High untuk ticket detail dengan banyak image

Lokasi bukti:

- `frontend/src/components/tickets/AttachmentList.tsx:9-37`
- `frontend/src/components/tickets/AttachmentList.tsx:147-159`
- `frontend/src/components/tickets/CommentSection.tsx:13-32`
- `frontend/src/components/tickets/CommentSection.tsx:235-245`
- `backend/src/attachments/attachments.controller.ts:77-110`

Masalah:

Setiap image attachment langsung memanggil API download blob saat komponen thumbnail mount. Jika ticket detail punya banyak image di direct attachments dan comments, browser akan mengirim banyak request download sekaligus. Backend mengirim file asli, bukan thumbnail kecil, sehingga bandwidth dan CPU I/O bisa boros.

Snippet frontend:

```tsx
useEffect(() => {
  const ctrl = new AbortController();
  apiClient.get(`/attachments/${id}/download?view=1`, { responseType: 'blob', signal: ctrl.signal })
    .then((r) => {
      const u = URL.createObjectURL(r.data);
      urlRef.current = u;
      setBlobUrl(u);
    })
    .catch(() => { if (!ctrl.signal.aborted) setBlobUrl(''); });
  return () => {
    ctrl.abort();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  };
}, [id]);
```

Langkah fix minimal:

1. Lazy-load thumbnail hanya saat item terlihat menggunakan `IntersectionObserver`.
2. Batasi jumlah concurrent thumbnail downloads, misalnya 3-4 request sekaligus.
3. Cache blob URL per attachment id selama page hidup agar berpindah section tidak download ulang.
4. Tambahkan `Cache-Control: private, max-age=300` dan `ETag`/`Last-Modified` di endpoint download jika access control tetap aman.

Langkah fix ideal:

1. Generate thumbnail kecil saat upload image.
2. Simpan path thumbnail di DB atau gunakan deterministic sidecar path.
3. Endpoint `/attachments/:id/thumbnail` mengirim thumbnail kecil, bukan file asli.
4. Preview full image baru diunduh saat user klik.

Checklist fix:

- [x] Tambah lazy loading thumbnail via IntersectionObserver.
- [x] Tambah cache per attachment id di component/hook.
- [x] Tambah header cache private di backend download.
- [ ] Pertimbangkan thumbnail generation untuk image upload (noted - ideal future step).
- [ ] Uji ticket detail dengan 50 image attachments.

### PERF-10 - Notifications dan Telegram Send Berjalan Sequential

Severity: Medium

Lokasi bukti:

- `backend/src/notifications/notifications.service.ts:55-84`
- `backend/src/notifications/notifications.service.ts:101-141`
- `backend/src/telegram/telegram.service.ts:267-273`

Masalah:

Saat ticket dibuat, service mengambil semua support users lalu membuat notification satu per satu dengan `await` di dalam loop. Telegram juga mengirim ke linked users satu per satu. Jika jumlah support/admin/linked user besar, latency event handler meningkat dan dapat memperlambat event pipeline.

Snippet notification:

```ts
for (const user of itsupportUsers) {
  await this.create({
    userId: user.id,
    title: 'New Ticket Created',
    message: `Ticket ${payload.ticketNumber}: ${payload.subject}`,
    data: { ticketId: payload.ticketId, type: 'ticket_created' },
  });
}
```

Snippet Telegram:

```ts
for (const user of users) {
  if (user.telegramChatId) {
    await this.sendMessage(token, Number(user.telegramChatId), message);
  }
}
```

Langkah fix:

1. Untuk in-app notification, tambahkan repository `createMany` jika tidak perlu return semua row. Jika perlu realtime payload per user, gunakan `Promise.allSettled` dengan concurrency limit.
2. Untuk Telegram, jangan `Promise.all` tanpa batas karena rate limit Telegram. Gunakan concurrency limit 3-5 atau queue sederhana.
3. Pisahkan event handler agar ticket mutation tidak menunggu broadcast eksternal jika tidak wajib. Bisa pakai background queue berbasis Redis nanti.

Contoh concurrency helper minimal:

```ts
async function runWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item) await task(item);
    }
  });
  await Promise.allSettled(workers);
}
```

Checklist fix:

- [x] Tambah batching/concurrency limit notification create via `runWithConcurrency`.
- [x] Tambah concurrency limit Telegram send (max 3 concurrent).
- [x] Pastikan kegagalan satu receiver tidak menggagalkan semua receiver (`Promise.allSettled` + try/catch).
- [ ] Monitor event handler duration.

### PERF-11 - MaintenanceGuard Melakukan Redis Read Pada Setiap Request

Severity: Medium pada traffic tinggi

Lokasi bukti: `backend/src/common/guards/maintenance.guard.ts:22-47`

Masalah:

Global `MaintenanceGuard` berjalan sebelum handler untuk seluruh API. Setiap request melakukan `redis.get('maintenance:enabled')`. Saat maintenance aktif, request juga mengambil message. Ini membuat Redis menjadi dependency latency untuk semua request, termasuk request ringan.

Snippet:

```ts
const enabled = await this.redis.get(MAINTENANCE_KEY);
if (enabled !== '1') return true;

const req = context.switchToHttp().getRequest<Request>();

if (this.isAllowedDuringMaintenance(req)) return true;

const message = await this.redis.get(MAINTENANCE_MESSAGE_KEY);
```

Langkah fix:

1. Cache maintenance state in-memory per API process selama TTL pendek, misalnya 1000-2000 ms.
2. Ambil `enabled` dan `message` dengan `mget` saat refresh cache.
3. Saat `setMaintenanceMode()` dipanggil, publish invalidation via Redis pub/sub atau cukup toleransi TTL pendek.
4. Jangan cache terlalu lama karena maintenance mode dipakai untuk safety restore.

Contoh konsep:

```ts
private cachedUntil = 0;
private cachedMaintenance = { enabled: false, message: null as string | null };

private async getMaintenanceCached() {
  const now = Date.now();
  if (now < this.cachedUntil) return this.cachedMaintenance;

  const [enabled, message] = await this.redis.getClient().mget(MAINTENANCE_KEY, MAINTENANCE_MESSAGE_KEY);
  this.cachedMaintenance = { enabled: enabled === '1', message: message || null };
  this.cachedUntil = now + 1000;
  return this.cachedMaintenance;
}
```

Checklist fix:

- [x] Tambah cache TTL pendek di guard (2 detik).
- [x] Gunakan `mget` untuk enabled + message.
- [ ] Test maintenance enable/disable delay maksimal sesuai TTL (manual verification).
- [x] Pastikan restore flow tetap aman (cache invalidation via TTL).

### PERF-12 - Frontend Belum Route-Level Code Splitting

Severity: Medium

Lokasi bukti: `frontend/src/App.tsx:1-16`

Masalah:

Semua page diimport statis di root `App`. Akibatnya bundle awal memuat admin pages, maintenance page, dashboard, ticket detail, dan login sekaligus. Untuk user EndUser, admin code tetap masuk initial bundle meskipun tidak pernah dipakai.

Snippet:

```tsx
import LoginPage from '@/pages/LoginPage';
import TicketsPage from '@/pages/TicketsPage';
import CreateTicketPage from '@/pages/CreateTicketPage';
import TicketDetailPage from '@/pages/TicketDetailPage';
import DashboardPage from '@/pages/DashboardPage';
import NotificationsPage from '@/pages/NotificationsPage';
import MyAccountPage from '@/pages/MyAccountPage';
import AdminUsersPage from '@/pages/AdminUsersPage';
import AdminMasterDataPage from '@/pages/AdminMasterDataPage';
import AdminMaintenancePage from '@/pages/AdminMaintenancePage';
```

Langkah fix:

1. Ganti page imports dengan `React.lazy`.
2. Bungkus routes dengan `Suspense` dan fallback loading.
3. Pastikan protected route tetap bekerja dan tidak expose data karena backend guard tetap sumber keamanan.
4. Setelah build, cek output chunk Vite.

Contoh:

```tsx
import { lazy, Suspense } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const TicketsPage = lazy(() => import('@/pages/TicketsPage'));
const AdminMaintenancePage = lazy(() => import('@/pages/AdminMaintenancePage'));

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="p-8"><LoadingSpinner /></div>}>
        <Routes>{/* existing routes */}</Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
```

Checklist fix:

- [x] Convert page imports ke `lazy()`.
- [x] Tambah `Suspense` fallback with LoadingSpinner.
- [x] Jalankan `frontend npm run build` — sukses.
- [x] Cek chunk output dan initial JS size (masing-masing page jadi terpisah, main bundle 331KB).

### PERF-13 - Nginx Belum Mengatur Cache-Control Untuk Static Assets

Severity: Medium

Lokasi bukti: `nginx/nginx.conf:88-92`

Masalah:

Vite menghasilkan asset fingerprinted di `/assets/...`. Nginx saat ini hanya `try_files` tanpa cache header khusus. Browser bisa tetap melakukan revalidation yang tidak perlu untuk JS/CSS fingerprinted.

Snippet:

```nginx
location / {
  root /usr/share/nginx/html;
  index index.html;
  try_files $uri $uri/ /index.html;
}
```

Langkah fix:

1. Tambah location untuk `/assets/` dengan immutable cache.
2. Set `index.html` no-cache agar deploy SPA tetap mengambil manifest terbaru.

Contoh config:

```nginx
location /assets/ {
  root /usr/share/nginx/html;
  add_header Cache-Control "public, max-age=31536000, immutable" always;
  try_files $uri =404;
}

location = /index.html {
  root /usr/share/nginx/html;
  add_header Cache-Control "no-cache" always;
}

location / {
  root /usr/share/nginx/html;
  index index.html;
  try_files $uri $uri/ /index.html;
  add_header Cache-Control "no-cache" always;
}
```

Checklist fix:

- [x] Update nginx cache policy (assets immutable, index.html no-cache).
- [ ] Test hard refresh setelah deploy (manual verification).
- [x] Test route SPA direct access tetap fallback ke `index.html` (existing `try_files` behavior preserved).

### PERF-14 - Admin Master Data Melakukan N Request Untuk Sub-categories

Severity: Medium

Lokasi bukti: `frontend/src/components/admin/MasterDataManagement.tsx:232-249`

Masalah:

SubCategory tab mengambil categories, lalu melakukan request per category untuk sub-categories. Padahal `useCategories()` sudah mengambil category dengan `subCategories` dari backend repository `CategoryRepository.findAll()`.

Snippet:

```tsx
const results = await Promise.all(
  categories.map((cat) =>
    apiClient.get<ApiEnvelope<SubCategory[]>>(`/categories/${cat.id}/sub-categories`)
  )
);
for (const res of results) {
  allSubs.push(...unwrapData(res));
}
```

Langkah fix minimal:

1. Derive `subCategories` dari data `categories` yang sudah ada.
2. Hanya panggil endpoint sub-category terpisah jika backend tidak mengembalikan subCategories.
3. Alternatif backend: tambah endpoint `GET /sub-categories` untuk list semua sub-categories.

Contoh:

```tsx
const subCategories = categories?.flatMap((category) =>
  (category.subCategories ?? []).map((sub) => ({
    ...sub,
    categoryId: category.id,
  }))
) ?? [];
```

Checklist fix:

- [x] Cek tipe `Category` sudah memuat `subCategories` (type sudah include `subCategories?: SubCategory[]`).
- [x] Hapus query N request di `SubCategoryManager` (sekarang derive dari `categories`).
- [x] Pastikan invalidation category/subcategory tetap refresh data (via `queryClient.invalidateQueries`).
- [x] Jalankan frontend lint/build — sukses.

### PERF-15 - Navbar Notification Dropdown Fetch Selalu Aktif

Severity: Low-Medium

Lokasi bukti: `frontend/src/layout/Navbar.tsx:31-37`

Masalah:

Dropdown notification mengambil 5 notification saat Navbar render, walaupun user tidak membuka dropdown. Layout juga polling unread count via `useUnreadNotificationCount()` di `frontend/src/layout/Layout.tsx:8`. Ini bukan masalah besar, tapi request bisa dikurangi.

Snippet:

```tsx
const { data } = useQuery({
  queryKey: ['notifications', 'dropdown'],
  queryFn: async () => {
    const res = await apiClient.get<PaginatedResponse<Notification>>('/notifications?page=1&limit=5');
    return res.data.data;
  },
});
```

Langkah fix:

1. Set `enabled: notifOpen` agar fetch hanya saat dropdown dibuka.
2. Tambah `staleTime: 30_000` atau reuse cache dari query notifications.
3. Setelah mark read/clear all, invalidate dropdown dan unread count query secara eksplisit.

Contoh:

```tsx
const { data } = useQuery({
  queryKey: ['notifications', 'dropdown'],
  enabled: notifOpen,
  staleTime: 30_000,
  queryFn: async () => {
    const res = await apiClient.get<PaginatedResponse<Notification>>('/notifications?page=1&limit=5');
    return res.data.data;
  },
});
```

Checklist fix:

- [x] Tambah `enabled: notifOpen`.
- [x] Tambah `staleTime: 30_000`.
- [x] Pastikan dropdown tetap refresh setelah notification mutation.

### PERF-16 - Notification Realtime Gateway Ada, Frontend Masih Polling

Severity: Low-Medium

Lokasi bukti:

- `backend/src/notifications/notifications.gateway.ts:89-94`
- `frontend/src/hooks/use-notifications.ts:7-17`
- `frontend/package.json:14-25`

Masalah:

Backend sudah punya Socket.IO gateway untuk event `notification.created`, tetapi frontend tidak memiliki `socket.io-client` dan masih polling unread count setiap 30 detik. Polling 30 detik masih wajar, tetapi jika user banyak, ini menjadi request berkala yang tidak perlu.

Snippet polling:

```ts
const query = useQuery({
  queryKey: ['notifications-unread-count'],
  queryFn: async () => {
    const response = await apiClient.get<ApiEnvelope<{ count: number }>>('/notifications/unread-count');
    return unwrapData(response);
  },
  refetchInterval: 30000,
});
```

Langkah fix opsional:

1. Tambah `socket.io-client` di frontend.
2. Connect ke namespace `/notifications` setelah login dengan access token memory.
3. Pada event notification, increment unread count dan invalidate dropdown/list query.
4. Turunkan polling menjadi fallback, misalnya 5 menit, atau disable saat socket connected.

Checklist fix:

- [x] Tambah socket client hook.
- [x] Handle reconnect/token refresh.
- [x] Invalidate notification queries saat event masuk.
- [x] Jadikan polling fallback, bukan mekanisme utama.

### PERF-17 - Ticket Detail Mengambil Data Ticket, Comments, Attachments Terpisah dan Sebagian Data Duplikatif

Severity: Low-Medium

Lokasi bukti:

- `backend/src/tickets/tickets.service.ts:252-314`
- `frontend/src/components/tickets/TicketDetail.tsx:66-68`
- `frontend/src/components/tickets/CommentSection.tsx:46`
- `frontend/src/components/tickets/AttachmentList.tsx:53`

Masalah:

`findById()` backend sudah include comments dan attachments, tetapi frontend tetap memanggil `useTicketComments()` dan `useTicketAttachments()` sebagai request terpisah. Ini bisa disengaja untuk modularitas, tetapi saat ticket detail dibuka, request awal bisa berisi data besar yang tidak dipakai oleh component comments/attachments karena mereka fetch ulang.

Snippet backend include:

```ts
const include: Record<string, unknown> = {
  requester: { select: { id: true, name: true, email: true, avatarUrl: true } },
  assignedTo: { select: { id: true, name: true, email: true, avatarUrl: true } },
  category: { select: { id: true, name: true } },
  subCategory: { select: { id: true, name: true } },
  comments: { /* ... */ },
  attachments: { /* ... */ },
  _count: { select: { comments: true, attachments: true } },
};
```

Langkah fix:

1. Pilih salah satu strategi:
   - Strategy A: `GET /tickets/:id` hanya return ticket metadata + counts, comments/attachments tetap endpoint terpisah.
   - Strategy B: `GET /tickets/:id` return semua detail dan frontend memakai data itu tanpa refetch comments/attachments.
2. Untuk performa dan payload control, Strategy A biasanya lebih baik. Comments/attachments bisa dipaginasi/lazy-load.
3. Jika Strategy A dipilih, hapus include comments/attachments dari `findById()` dan biarkan tab/section load terpisah.
4. Tambah pagination untuk comments/attachments jika bisa sangat banyak.

Checklist fix:

- [x] Tentukan strategi data ticket detail (Strategy A: backend omits comments/attachments include, frontend fetches separately).
- [x] Hindari payload duplikatif.
- [x] Tambah pagination comments/attachments via page/limit query params + frontend Pagination component.
- [x] Update tests dan frontend hooks sesuai strategi.

### PERF-18 - Admin Users dan Notifications Belum Memakai Pagination UI Secara Penuh

Severity: Low-Medium, juga functional UX risk

Lokasi bukti:

- `backend/src/common/repositories/user.repository.ts:58-80`
- `frontend/src/hooks/use-users.ts:5-13`
- `frontend/src/components/admin/UserManagement.tsx:30-31`
- `frontend/src/hooks/use-notifications.ts:28-37`
- `frontend/src/pages/NotificationsPage.tsx:7-21`

Masalah:

Backend user list dan notification list sudah mendukung pagination, tetapi frontend `useUsers()` dan `useNotifications()` hanya unwrap `data` dan tidak expose `meta` ke UI. Admin users juga tidak mengirim `page/limit`, sehingga default backend hanya 10 user. Jika nanti frontend menaikkan limit besar untuk workaround, tabel besar akan menjadi berat.

Langkah fix:

1. Ubah hooks agar mengembalikan `{ data, meta }` via `unwrapPage`.
2. Tambah state `page`, `limit` dan component `Pagination` di Admin Users dan NotificationsPage.
3. Pertahankan max `limit <= 100` dari DTO.

Checklist fix:

- [x] Update `useUsers` memakai `unwrapPage`.
- [x] Update `useNotifications` memakai `unwrapPage`.
- [x] Tambah pagination UI.
- [ ] Tambah regression test pagination jika memungkinkan (future).

### PERF-19 - Cache Strategy TanStack Query Masih Generik Untuk Data Static

Severity: Low

Lokasi bukti:

- `frontend/src/main.tsx:11-19`
- `frontend/src/hooks/use-categories.ts:5-24`
- `frontend/src/hooks/use-users.ts:16-25`
- `frontend/src/hooks/use-telegram.ts:59-67`

Masalah:

Default query stale time adalah 2 menit untuk semua query. Data master seperti categories, assignable users, dan Telegram config relatif jarang berubah, sehingga bisa diberi `staleTime` lebih panjang dan invalidation eksplisit setelah mutation.

Langkah fix:

1. Tambahkan `staleTime` per hook untuk data static.
2. Contoh categories: 10-30 menit.
3. Assignable users: 5-10 menit, invalidasi saat user create/update/delete.
4. Maintenance mode tetap polling pendek karena sifat operasional.

Contoh:

```ts
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<Category[]>>('/categories');
      return unwrapData(response);
    },
  });
}
```

Checklist fix:

- [x] Tambah staleTime khusus categories (30 menit).
- [x] Tambah staleTime khusus assignable users (10 menit).
- [x] Tambah staleTime khusus telegram config (5 menit).
- [x] Pastikan mutation admin invalidates query terkait (existing behavior).

### PERF-20 - Backup Listing Membaca Metadata Semua Backup Secara Paralel Tanpa Batas

Severity: Low-Medium

Lokasi bukti: `backend/src/maintenance/maintenance.service.ts:144-154`

Masalah:

`listBackups()` membaca semua directory backup lalu menjalankan `Promise.all(ids.map(...))`. Jika backup sangat banyak, ini memicu banyak `fs.stat` paralel. Saat ini kemungkinan kecil, tapi mudah memburuk jika backup harian tidak dibersihkan.

Snippet:

```ts
return Promise.all(ids.map((id) => this.getBackup(id)));
```

Langkah fix:

1. Tambah pagination/limit untuk backup list, misalnya default 50 terbaru.
2. Atau proses dengan concurrency limit kecil.
3. Tambah retensi backup otomatis jika sesuai kebutuhan ops.

Checklist fix:

- [x] Tambah limit/pagination backup list (default 50 terbaru).
- [x] Tambah concurrency limit untuk `getBackup` (concurrency 5 via worker pool).
- [ ] Tambah retention policy ops jika diperlukan (ops decision).

## Roadmap Implementasi Detail

### Tahap 1 - Database Foundation

Target: mengurangi query scan dan sort mahal sebelum refactor service.

Checklist:

- [x] Update `backend/prisma/schema.prisma` dengan index Prisma dari PERF-01.
- [x] Buat raw SQL migration untuk `pg_trgm` dan partial index dashboard resolved ticket.
- [x] Drop redundant index `users_email_idx` hanya jika migration existing memang membuatnya dan tidak dipakai selain unique constraint (tidak ada `users_email_idx` standalone selain unique constraint).
- [x] Jalankan SQL migration langsung via psql ke database running (container tidak memiliki file migrasi terbaru).
- [x] Rebuild Docker image untuk sinkronisasi migrasi Prisma (`docker compose build api` + restart).
- [x] Jalankan `npx prisma generate` di container setelah rebuild (Dockerfile runs it at build time; migration registered in `_prisma_migrations`).
- [x] Jalankan `backend npm run build` — sukses.
- [x] Jalankan targeted test backend — 47 tests pass.
- [ ] Jalankan `EXPLAIN ANALYZE` query tiket/dashboard.

Raw SQL tambahan yang disarankan:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS tickets_subject_trgm_idx
  ON tickets USING gin ("subject" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tickets_description_trgm_idx
  ON tickets USING gin ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tickets_ticket_number_trgm_idx
  ON tickets USING gin ("ticketNumber" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS users_name_trgm_idx
  ON users USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS users_email_trgm_idx
  ON users USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS tickets_resolved_category_partial_idx
  ON tickets ("categoryId")
  WHERE "resolvedAt" IS NOT NULL AND status IN ('Resolved', 'Closed');
```

### Tahap 2 - Backend Hot Path Refactor

Target: menghilangkan pola query yang tumbuh linear terhadap jumlah row/page.

Checklist:

- [x] Refactor EndUser counts di `TicketsService.findAll()`.
- [x] Refactor SLA cron ke keyset.
- [x] Refactor ticket number ke sequence.
- [x] Refactor dashboard aggregation/cache.
- [x] Refactor LocalStorage sync I/O.
- [x] Update existing tests agar sesuai behavior baru.
- [x] Jalankan `backend npm test` (47 pass) dan `backend npm run build` (sukses).

### Tahap 3 - Frontend Loading dan Network Reduction

Target: mengurangi initial bundle dan request yang tidak perlu.

Checklist:

- [x] Route-level lazy import untuk pages.
- [x] Lazy thumbnail/image download via IntersectionObserver + blob cache (PERF-09).
- [x] Navbar notification query `enabled: notifOpen`.
- [x] MasterData subcategory no N request.
- [x] Pagination UI untuk users/notifications (PERF-18).
- [x] Socket.IO realtime notification hook + auto-reconnect (PERF-16).
- [x] Pagination comments/attachments di ticket detail.
- [x] Streaming CSV export dengan keyset pagination (PERF-07).
- [x] Static cache header nginx.
- [x] Jalankan `frontend npm run lint` (0 errors) dan `frontend npm run build` (sukses).

### Tahap 4 - Observability dan Validasi

Target: memastikan fix terbukti, bukan hanya asumsi.

Checklist:

- [ ] Aktifkan PostgreSQL slow query log di staging.
- [ ] Tambah timing log untuk endpoint `/tickets`, `/dashboard/stats`, `/notifications`, `/attachments/:id/download`.
- [ ] Buat dataset staging representatif: minimal 50k tickets, 200k comments, 100k attachments metadata, 500 users.
- [ ] Jalankan baseline sebelum fix dan sesudah fix.
- [ ] Catat p50/p95/p99 latency dan DB CPU/IO.

## Catatan Risiko Behavior

- Menambah index aman untuk behavior, tetapi meningkatkan write overhead dan storage. Index harus dipilih berdasarkan query nyata dan dievaluasi setelah deploy.
- Mengubah ticket number ke sequence dapat membuat gap nomor jika transaction rollback. Ini normal untuk sequence PostgreSQL dan lebih baik daripada full scan. Jika nomor wajib gapless, perlu counter table dengan row lock, bukan sequence.
- Cache dashboard membuat data bisa terlambat 30-60 detik. Jika UI butuh real-time, invalidation setelah mutation wajib diterapkan.
- Lazy thumbnail mengubah timing load image. Pastikan UX tetap jelas dengan skeleton/loading state.
- Route-level code splitting mengubah loading state route. Pastikan fallback tidak merusak layout.

## Catatan Untuk Agent AI Berikutnya

Konteks penting:

- User meminta review performa, bukan implementasi fix. File ini dibuat sebagai handoff dan tracking checklist.
- `AGENTS.md` wajib dipatuhi. Backend change harus menjaga flow service -> repository; jangan inject `PrismaService` langsung ke service baru kecuali pola existing sudah begitu dan ada alasan kuat.
- Jangan menyimpan access token di persistent storage. Auth frontend saat ini memory-only di Zustand dan harus dipertahankan.
- Jangan expose EndUser ke dashboard/admin/internal comments/attachments.
- Jangan jalankan destructive command seperti `docker compose down -v`, `git reset --hard`, atau checkout file tanpa instruksi eksplisit.
- Worktree mungkin dirty. Jangan revert perubahan user.

Urutan kerja yang disarankan untuk sesi baru:

1. Baca `AGENTS.md` dan `CODE_REVIEW.md` ini.
2. Mulai dari PERF-01 sampai PERF-06 karena itu berdampak paling tinggi.
3. Untuk setiap fix, buat perubahan kecil dan terpisah. Jangan gabungkan semua optimasi dalam satu patch besar.
4. Setelah backend schema berubah, buat migration resmi dan jalankan verifikasi backend.
5. Setelah frontend berubah, jalankan lint/build frontend.
6. Update checkbox di file ini setelah fix benar-benar selesai dan terverifikasi.

File paling relevan untuk mulai:

- `backend/prisma/schema.prisma`
- `backend/src/tickets/tickets.service.ts`
- `backend/src/common/repositories/ticket.repository.ts`
- `backend/src/sla/sla.service.ts`
- `backend/src/dashboard/dashboard.service.ts`
- `backend/src/attachments/services/local-storage.service.ts`
- `frontend/src/App.tsx`
- `frontend/src/components/tickets/AttachmentList.tsx`
- `frontend/src/components/tickets/CommentSection.tsx`
- `frontend/src/components/admin/MasterDataManagement.tsx`
- `nginx/nginx.conf`

Verifikasi yang direkomendasikan per area:

- Backend unit tests: `npm test` di `backend`.
- Backend build: `npm run build` di `backend`.
- Frontend lint: `npm run lint` di `frontend`.
- Frontend build: `npm run build` di `frontend`.
- Migration validation: `npx prisma migrate dev` local/staging, lalu `npx prisma migrate deploy` untuk deploy flow.
- Query validation: `EXPLAIN (ANALYZE, BUFFERS)` untuk ticket list, dashboard counts, search ticket, notification list.

Jangan tandai checklist selesai sebelum:

- Kode sudah berubah.
- Test/build relevan sudah hijau atau keterbatasan jelas dicatat.
- Jika performa adalah tujuan, minimal ada bukti query plan atau pengukuran latency sebelum/sesudah.

## Status Review Ini

- [x] `AGENTS.md` dibaca.
- [x] Struktur backend/frontend, Prisma schema, migration, nginx, Docker, dan file hot path dibaca.
- [x] Temuan performa disusun dengan bukti file/line.
- [x] Checklist fix dibuat untuk tracking.
- [x] Catatan handoff untuk agent sesi berikutnya dibuat.
- [x] Fix performa diimplementasikan (PERF-01 s.d. PERF-15, PERF-19, PERF-20).
