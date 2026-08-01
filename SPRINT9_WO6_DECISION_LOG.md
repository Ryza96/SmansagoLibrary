# SPRINT9 — WO-6 Decision Log
**Book Import**

## D-1: `BookImportService` = tahap ketiga dalam handler `imports:match`
**Keputusan:** `bookImport.importBooks(...)` dipanggil setelah `engine.match` + `autoCreate.apply` di
`book-import.ipc.ts`; renderer tetap menerima satu `MatchedWorkbook` final.
**Alasan:** sesuai spec ("seluruh proses di Main Process, renderer hanya terima hasil akhir"); tidak perlu
channel IPC baru; pipeline utuh = match → auto-create → book import dalam satu trip.

## D-2: `title` diambil dari `canonicalRow.values['title']`, bukan resolvedEntity
**Keputusan:** Judul dibaca langsung dari baris; entity id (author/publisher/category) dari `resolvedEntity`.
**Alasan:** `title` bukan field strategi (tidak di-match, audit F-6); satu-satunya sumber nilai adalah baris.

## D-3: Interpretasi ketat "seluruh entity wajib tersedia" = authorId + publisherId + categoryId semuanya non-null
**Keputusan:** Bila salah satu dari tiga `resolvedEntity` null (SKIPPED/AMBIGUOUS/gagal create), Book **tidak** dibuat
dan issue `bookImport.entityMissing` dicatat.
**Alasan:** spec eksplisit mencantumkan ketiga FK dalam pembuatan Book dan mensyaratkan "seluruh entity wajib
tersedia". Konservatif = tidak membuat Book dengan FK null.
**Catatan dampak:** di template riil `publisher` tidak ada kolom (F-5 audit) → semua baris akan kena
`entityMissing` sampai PO memutuskan (tambah kolom publisher ATAU relaksasi syarat). Dikatalogkan di TD.

## D-4: ISBN blank → diizinkan (Book tanpa ISBN)
**Keputusan:** Guard "ISBN belum ada" hanya berlaku saat ISBN terisi; baris tanpa ISBN tetap bisa dibuat Book
bila syarat lain terpenuhi.
**Alasan:** kolom `isbn` di schema opsional (`String? @unique`) dan template `nullable: true`. Guard duplikat
bermakna "jangan buat ulang ISBN yang sudah ada", bukan "wajib ada ISBN".

## D-5: `publicationYear` (template `year`) TIDAK ikut dibuat di WO-6
**Keputusan:** Field Book yang diisi persis sesuai daftar PO: `title, isbn, authorId, publisherId, categoryId`.
**Alasan:** RUANG LINGKUP WO-6 eksplisit; menambahkan `year` = scope creep. Tahun tersedia di `canonicalRow.values['year']`
dan tinggal ditambahkan di WO lanjutan (TD-3).

## D-6: Issue book gagal direkam di `matchedRow.issues` DAN `matchingResult.errors`
**Keputusan:** Semua jalur gagal mem-push `MatchingIssue { rowNumber, messageKey }` ke baris dan agregat errors.
**Alasan:** konsisten dengan WO-5 (warnings untuk Auto Create, errors untuk Book Import karena book gagal =
tidak ada output buku); memberi konsumen UI satu tempat lihat kegagalan.
**Tidak menyentuh** `matchingResult.valid` (milik engine; hardcoded `true` — TD).

## D-7: Guard ISBN memakai `existsByISBN` (check-then-create) + recovery P2002
**Keputusan:** Check duplikat via `bookRepository.existsByISBN`, lalu `create`; catch P2002 (race/duplikat) →
issue duplicate, selainnya → `bookImport.createFailed`.
**Alasan:** tetap lewat `BookRepository` (SSOT); guard normal menangani kasus umum, catch menangani race.

## Keputusan yang sengaja TIDAK diambil (out of scope)
- Transaksi seluruh batch (book+entity) — WO-6 per-barris create non-transaksional; kandidat WO lanjutan (TD-4).
- Mengisi `matchingResult.valid` dari hasil import — butuh perubahan engine (dilarang di WO-6).
- Menambah `year`/description/notes ke Book — di luar daftar field PO.
- Kebijakan publisher (F-5) — keputusan PO, bukan kode.
