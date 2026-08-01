# SPRINT9 — WO-5 Decision Log
**Auto Create**

## D-1: Hasil create ditempel ke `FieldMatch.resolvedEntity` (bukan struktur baru)
**Keputusan:** Menambah field opsional `resolvedEntity?: MatchCandidate | null` pada `FieldMatch`.
**Alasan:**
- WO-5 mensyaratkan "hasil create ditambahkan ke struktur output agar Book Import tidak lookup ulang". `FieldMatch`
  adalah unit per-field yang sudah membawa `status` + `candidates`; menempelkan entitas resolve di tempat yang sama
  menjaga satu sumber per field.
- `MatchCandidate { id, label }` dipakai ulang → konsumen (WO-6) mendapat `id` (link ke Book.authorId/publisherId/categoryId)
  dan `label` tanpa query tambahan.
- Opsional → engine lama (tanpa `resolvedEntity`) tetap valid; Auto Create hanya mengisi. Tidak ada breaking change.
**Ditolak:** `MatchedRow.createdEntities: Record<field, ...>` — menambah dua jalur data (matches + entity) yang harus
disinkronkan; `matchedRows` baru — duplikasi struktur besar per run.

## D-2: Auto Create = tahap terpisah setelah Matching, di dalam handler `imports:match`
**Keputusan:** `autoCreateService.apply(matchedWorkbook)` dipanggil tepat setelah `engine.match(...)` di
`book-import.ipc.ts`, sebelum hasil dikirim ke renderer.
**Alasan:** Konsisten WO-4.1 (pipeline berjalan utuh di main process, renderer hanya terima hasil akhir);
tidak perlu channel IPC baru — payload renderer tetap `canonicalRows`, response tetap `MatchedWorkbook`.

## D-3: Persistensi via Repository, tanpa query Prisma langsung
**Keputusan:** `AuthorRepository.create`, `PublisherRepository.create`, `CategoryRepository.create`,
dan recovery via `findExact`. Tidak ada import `@prisma/client` di service.
**Alasan:** Aturan WO-5 eksplisit + SSOT. Deteksi P2002 via duck-typing `error.code === 'P2002'` (bukan import
kelas Prisma) → tetap tanpa dependency Prisma di service.

## D-4: `Category.code` digenerate `toCategoryCode(name)`
**Keputusan:** Kode = nama → uppercase, non-alphanumerik → `_`, fallback `CATEGORY` (kolom `code` `@unique`).
**Alasan:** Schema `Category` mewajibkan `code`; kategori hasil impor tidak punya kode dari pengguna.
Kode dibaca dari nama agar dapat diprediksi (mis. "Sejarah" → `SEJARAH`).
**Risiko teridentifikasi:** dua nama kategori berbeda dengan slug sama → P2002 → recovery `findExact(name)`
tidak menemukan (nama beda) → issue `autoCreate.createFailed` dicatat, entity tidak dibuat. Diterima; katalog di TD.

## D-5: Dedupe intra-run via `Map<"field::name", MatchCandidate>`
**Keputusan:** Baris diproses sekuensial + cache hasil create; duplikat field+name dalam satu run → reuse id.
**Alasan:** Matching berjalan untuk SEMUA baris dulu, lalu Auto Create. Dua baris dengan author sama akan sama-sama
NOT_FOUND → tanpa dedupe terjadi insert ganda (atau P2002 untuk author/publisher unik). Dedupe menjamin 1 entitas per nama
dalam satu run dan membuat output `resolvedEntity` konsisten antar baris.

## D-6: NOT_FOUND pada field `isbn` → tidak create, tanpa issue
**Keputusan:** `isbn` di luar `CREATABLE_FIELDS` → `resolvedEntity = null`, dilewati.
**Alasan:** Book/BookCopy/barcode memang di luar scope WO-5 (WO-6/7). Bukan error — tidak dicatat sebagai issue
(sesuai spesifikasi: issue khusus AMBIGUOUS).

## D-7: Multi-author (`"A; B"`) TIDAK dipecah di WO-5
**Keputusan:** Nilai `authors` diperlakukan sebagai satu nama author.
**Alasan:** (a) WO-5 tidak menyebut kebijakan pemisah; (b) schema `Book.authorId` hanya menampung **satu** author per
buku — hasil pecahan tak bisa dikonsumsi WO-6; (c) memecah = mengubah perilaku matching. Dikatalogkan di TD-6/Future Work.

## D-8: Issue AMBIGUOUS dicatat di `matchedRow.issues` DAN `matchingResult.warnings`
**Keputusan:** Kedua tempat diisi dengan `MatchingIssue { rowNumber, messageKey: 'autoCreate.ambiguous' }`.
**Alasan:** `matchedRow.issues` = konteks per baris; `matchingResult.warnings` = agregat workbook yang mudah
dikonsumsi UI. Menambahkan (bukan mengganti) — tidak mengubah engine.

## Keputusan yang sengaja TIDAK diambil (out of scope)
- Mengisi `matchingResult.valid` dari status nyata (mash hardcoded `true` di engine) — F-3 audit; butuh perubahan
  engine = di luar batasan WO-5. Dikatalogkan di TD.
- Kebijakan AMBIGUOUS resolusi (skip/blokir/pilih pertama dengan scoring) — F-8/R4; keputusan PO, WO terpisah.
- Perbaikan publisher mati di template riil (F-5) — keputusan PO (tambah kolom template vs hapus strategy).
