# IMPORT_MEMBER_ARCHITECTURE_AUDIT

**Audit:** Fitur "Import Anggota" (Member Import)
**Mode:** READ ONLY — inspeksi source, tanpa perubahan kode, tanpa commit
**Tanggal:** 02-08-2026
**Status:** MENUNGGU KEPUTUSAN PO

---

## 1. Executive Summary

Fitur **Import Anggota TIDAK ADA** di codebase saat ini. Tidak ada satu pun artefak
member-import: halaman, route, IPC handler, preload method, service, repository,
DTO, template config, file Excel template, maupun label.

Yang ADA adalah pipeline **Import Buku** yang lengkap dan bekerja (`Buku → Import
Buku → Pilih File → Validasi → Preview → Import → Matching → Auto Create → DB`),
ditambah infrastruktur generik (transaction, parser, validation engine, matching
engine, strategi/provider) yang terbukti berjalan. Infrastruktur ini **dapat
digunakan kembali**, tetapi seluruh lapisan domain Buku (template, strategi,
auto-create, service, IPC, label, template Excel) **tidak bisa dipakai langsung**
untuk Anggota.

**Kesimpulan readiness:** MODULE TIDAK PRODUCTION-READY. Import Anggota tidak ada
sama sekali (0 bukti source). Estimasi: ini adalah pembangunan fitur baru end-to-end
(~10-14 artefak baru), bukan aktivasi fitur tersembunyi.

---

## 2. Current Architecture

### 2.1 Stack Member (CRUD) — Ada, Tanpa Import

| Layer | File | Status |
|-------|------|--------|
| Service | `src/main/services/member.service.ts` | CRUD aktif (`findMany/findById/create/update/delete`); `create` default `status: 'INACTIVE'`, generate `memberNumber` via `NumberGeneratorService` |
| Repository | `src/main/repositories/member.repository.ts` | CRUD + `findByMemberNumber`, `existsByMemberNumber`, `count`, `countBorrows`, `findByNISN/NIP/NUPTK/NIK`; **TIDAK ada `createMany`/bulk** |
| IPC | `electron/ipc/member.ipc.ts` | Channel `members:findMany/findById/create/update/delete` |
| Preload | `electron/preload/member.preload.ts` | API `api.members.*` |
| DTO | `src/shared/dto/member.ts` | `CreateMemberDTO` (semua field opsional, tanpa `status` default di DTO — default di service) |
| Halaman | `src/pages/MemberListPage.tsx`, `MemberCreatePage.tsx`, `MemberEditPage.tsx`, `MemberDetailPage.tsx` | CRUD UI; `MemberListPage` hanya punya tombol **"+ Tambah"** — tidak ada tombol Import |
| Route | `src/routes/index.tsx` | `member-list/create/edit/detail` — tidak ada route import |
| Nav | `src/components/layout/Sidebar.tsx` | Menu Anggota (Siswa/Guru/Umum) — tidak ada item Import |
| Legacy (mati) | `electron/main/services/member.service.ts`, `electron/main/repositories/member.repository.ts` | Duplikat lama (`findById/update/search` + repo `findById/update/search`); `members.search` **0 panggilan** di `src/` — legacy/unused |

### 2.2 Stack Import Buku — Pipeline Penuh (Referensi)

| Tahap | File | Keterangan |
|-------|------|------------|
| Parser | `src/services/WorkbookReaderService.ts` | `read-excel-file/browser` → `Sheet[] {sheet, data}` |
| Template config | `src/config/bookImport.template.ts` + `detectBookImportTemplate` | Definisi kolom Buku (title/authors/publisher/year/category/isbn/…) |
| Config | `src/config/import.config.ts` | `IMPORT_CONFIG` generik (maxFileSize, allowedExtensions) |
| Header normalizer | `src/services/HeaderNormalizerService.ts` | Synonyms (publisher→penerbit, dll.) |
| Validation | `src/services/ValidationEngineService.ts` | validate row → canonical row; error `IMP-001..015` |
| Matching | `src/services/MatchingEngineService.ts` | Strategi-driven; hasil `SKIPPED/FOUND/AMBIGUOUS/NOT_FOUND` |
| Strategi | `src/main/strategies/index.ts` → `createProductionStrategies()` | Exact/Contains untuk Book/Author/Publisher/Category |
| Provider | `src/main/providers/*` (book/author/publisher/category) | Query Prisma untuk match |
| Auto create | `src/main/services/auto-create.service.ts` | Buat entitas author/publisher/category (creator map) |
| Import | `src/main/services/book-import.service.ts` | Loop per baris; `INVENTORY_CREATE_RETRIES=3`; wrap `runTransaction`; buku + copy |
| IPC | `electron/ipc/book-import.ipc.ts` | `imports:match` (matching+import), `imports:downloadTemplate` (save dialog, resolve `templates/`) |
| Preload | `electron/preload/book-import.preload.ts` | `api.imports.match/downloadTemplate` |
| Types | `src/types/import.ts` | `CanonicalRow`, `ValidatedWorkbook`, `MatchedWorkbook`, `TemplateColumn`, `ImportErrorCode` |
| Context | `src/contexts/BookImportContext.tsx` + `src/hooks/useBookImportWorkflow.ts` | State workflow file→parse→validate |
| UI | `src/pages/BookImportPage.tsx`, `BookImportPreviewPage.tsx` | Upload + preview (limit 50/20) |
| Dropzone | `src/components/books/FileUploadDropzone.tsx` | Komponen upload generik (tidak terikat domain Buku) |
| Utils | `src/utils/bookImport.ts` | `computeImportResultSummary`, `formatFileSize` (buku-centric) |
| Labels | `src/utils/labels.ts` → blok `IMPORT` | Teks "Import Buku" (buku-centric) |
| Wiring | `electron/main/bootstrap.ts:103` | `new MatchingEngineService(createProductionStrategies())` |
| Template file | `templates/Template_Import_Buku_v1.0.xlsx`, `_v2.0.xlsx` | Hanya template Buku yang ada |
| Packaging | `electron-builder.yml` | `extraResources` menyertakan `templates/Template_Import_Buku_v2.0.xlsx` saja |

### 2.3 Infrastruktur Generik (Shared)

- `src/main/repositories/base/transaction.ts` — `runTransaction(prisma, fn)`
- `src/main/repositories/base/prisma.ts` — `getPrisma()` singleton
- `src/main/repositories/base/base.repository.ts` — `BaseRepository` (prisma protected)
- `src/main/repositories/base/pagination.ts` — paginasi
- `src/shared/match-provider.ts` — `MatchProvider`/`NamedMatchProvider` + 4 impl Buku
- `src/shared/match-strategy.ts` — `MatchStrategy` + 4 impl Buku (`BookMatchStrategy.field='isbn'`)
- `src/shared/dto/*` — DTO per domain

---

## 3. Existing Components (Apa yang Sudah Ada)

1. **Pipeline Import Buku lengkap** (2.2) — bukti arsitektur yang bekerja.
2. **Stack Member CRUD** (2.1) — service/repo/IPC/preload/halaman/route/nav.
3. **`MemberRepository.existsByMemberNumber` + `count`** — siap dipakai untuk alokasi nomor anggota massal.
4. **`NumberGeneratorService.generateMemberNumber(memberType)`** — prefix `S/G/U`, `count()+1` pad 6 (punya technical debt, lihat §7).
5. **Infrastruktur transaksi** `runTransaction` + pola `createWithTx`/`createManyWithTx` (dipakai Buku).
6. **`src/types/import.ts`** — jenis field-agnostik (key berbasis string) yang bisa dipakai ulang.
7. **`FileUploadDropzone`** — komponen dropzone generik.
8. **Channel IPC lain** `settings`, `classes` — tersedia (dropdown kelas feasible tanpa IPC baru).
9. **Dependency `read-excel-file@^9.3.5`** — sudah ada di `package.json`.

---

## 4. Missing Components (Yang Wajib Dibangun)

> SEMUA artefak di bawah **tidak ada** — diverifikasi via grep: `memberImport`,
> `members:import`, `importMember`, `Import Anggota`, `MEMBER_IMPORT`,
> `import-members`, `members/import` = **0 match** di seluruh repo.

| # | Komponen | Catatan |
|---|----------|---------|
| 1 | Halaman `MemberImportPage.tsx` + `MemberImportPreviewPage.tsx` | Belum ada |
| 2 | Route `/anggota/import` di `src/routes/index.tsx` + `ROUTES` di `src/utils/navigation.ts` | Belum ada |
| 3 | Item menu sidebar "Import Anggota" | Belum ada |
| 4 | Label blok `MEMBER_IMPORT` di `src/utils/labels.ts` | Blok `IMPORT` saat ini hanya untuk Buku |
| 5 | Template config `detectMemberImportTemplate` + kolom (NISN/NIP/NUPTK/NIK/Nama/Kelas/…) | Belum ada; header normalizer butuh synonyms member |
| 6 | File Excel `templates/Template_Import_Anggota_v1.0.xlsx` | Folder `templates/` hanya berisi template Buku |
| 7 | `MemberImportService` di `src/main/services/` (allokasi memberNumber, dedup, transaksi, log hasil) | Belum ada; `MemberRepository` tak punya `createMany` |
| 8 | Bulk insert `createManyWithTx` di `MemberRepository` | Belum ada |
| 9 | Provider match member (`PrismaMemberMatchProvider`) + provider match kelas (`PrismaClassMatchProvider`) | Belum ada |
| 10 | Strategi member + kelas (`MemberImportStrategies` / `createMemberImportStrategies`) | Belum ada |
| 11 | IPC `members:import` + `members:downloadTemplate` (+ preload + `env.d.ts`) | Hanya channel CRUD yang ada |
| 12 | DTO member-import (`MemberImportDTO`, `MemberImportResultDTO`, canonical member row) | Belum ada |
| 13 | Validasi enum member (`SISWA/GURU/UMUM`, `LAKI_LAKI/PEREMPUAN`, `ACTIVE/INACTIVE`) | `ValidationEngineService` hanya mendukung string/number/date + min/max — tidak ada allowlist enum |
| 14 | Utility `computeMemberImportResultSummary` (analog buku) | Belum ada |
| 15 | Update `electron-builder.yml` `extraResources` agar mengemas template anggota | Saat ini filter hanya file template Buku |

---

## 5. Reusable Components (Yang Bisa Dipakai Ulang)

### 5.1 Bisa dipakai ulang (as-is)

| Komponen | Path |
|----------|------|
| `runTransaction` | `src/main/repositories/base/transaction.ts` |
| `getPrisma` / `BaseRepository` | `src/main/repositories/base/prisma.ts`, `base.repository.ts` |
| `WorkbookReaderService` (parser) | `src/services/WorkbookReaderService.ts` |
| Inti `ValidationEngineService` (validateRow/buildCanonicalRow, saat diberi TemplateColumn member) | `src/services/ValidationEngineService.ts` |
| `MatchingEngineService` (strategi-driven) | `src/services/MatchingEngineService.ts` |
| Abstraksi `MatchProvider`/`MatchStrategy` | `src/shared/match-provider.ts`, `match-strategy.ts` |
| Types field-agnostik `CanonicalRow`/`ValidatedWorkbook`/`MatchedWorkbook`/`TemplateColumn`/`ValidationIssue` | `src/types/import.ts` |
| `FileUploadDropzone` | `src/components/books/FileUploadDropzone.tsx` |
| `IMPORT_CONFIG` (maxFileSize/extensions) | `src/config/import.config.ts` |
| Pattern IPC template download (save dialog + `templates/`) | `electron/ipc/book-import.ipc.ts` (pola, bukan isi) |
| Channel `settings`, `classes` (untuk dropdown/academic-year di UI) | `electron/ipc/*` |
| `MemberRepository.existsByMemberNumber`, `count` | `src/main/repositories/member.repository.ts` |
| Dependency `read-excel-file` | `package.json` |

### 5.2 TIDAK bisa dipakai ulang langsung (perlu varian member)

| Komponen | Alasan |
|----------|--------|
| `bookImport.template.ts` + `detectBookImportTemplate` | Kolom buku ≠ kolom anggota |
| `HeaderNormalizerService` | Tabel synonyms berisi kata Buku (penerbit/tahun/jumlah copy); butuh synonyms member |
| `AutoCreateService` (`CREATABLE_FIELDS=authors/publisher/category`) | Domain buku; untuk anggota kelas adalah data master (sebaiknya di-match, bukan auto-create) |
| `BookImportService` (transaksi buku+copy) | Perlu `MemberImportService` terpisah |
| `createProductionStrategies()` + 4 provider buku | Perlu provider/strategi member + kelas |
| `book-import.ipc.ts` / `book-import.preload.ts` / blok `imports` di `env.d.ts` | Channel buku; perlu channel member terpisah |
| `BookImportContext` / `useBookImportWorkflow` | Terikat `ValidationEngineService` + template buku; perlu varian atau genericize |
| `computeImportResultSummary` / `formatFileSize` (blok buku) | `copyCount`-centric; butuh ringkasan member |
| Blok `LABELS.IMPORT` | Teks "Import Buku" |
| Template file `.xlsx` | Belum ada untuk anggota |
| Filter `extraResources` di `electron-builder.yml` | Hanya menyertakan file template buku |

---

## 6. Database Impact

**TIDAK ADA perubahan schema yang diwajibkan untuk fitur ini.**

- Model `Member` sudah ada (`memberNumber` @unique, `fullName`, `memberType`,
  `gender`, `nisn` @unique, `nip` @unique, `nuptk` @unique, `nik` @unique,
  `birthPlace`, `birthDate`, `address`, `phone`, `email`, `classId` FK opsional ke
  `Class`, `status`).
- Semua field unik yang dipakai dedup (NISN/NIP/NUPTK/NIK/memberNumber) sudah
  ber-index unik di schema.
- `classId` sudah nullable FK → data import tanpa kelas diperbolehkan.
- **Catatan teknis:** kolom `memberNumber` di-DB bernama `number` dan `birthPlace`
  bernama `birthplace` (via `@map`). Ini adalah utang lama yang **sudah direncanakan**
  untuk dibersihkan (M7/M8) tapi **belum dieksekusi** (migrations aktif hanya 3:
  `adr002_initial`, `wo13_procurement_fields`, `wo13_revision1_source_detail`).
  Tidak menghalangi import, tapi bila ada rencana bulk-SQL manual, `@map` perlu
  diperhatikan.

---

## 7. Migration Impact

**TIDAK ADA migrasi baru yang diwajibkan** untuk member import.

- Tidak ada model/kolom baru.
- Migrasi `@map` cleanup (M7/M8) adalah keputusan terpisah dan pre-existing — bukan
  syarat fitur ini.

---

## 8. Technical Debt

### 8.1 Sudah ada (terkait, akan ikut menular)

1. **`NumberGeneratorService.generateMemberNumber` memakai `count()+1`**
   (`src/main/services/number-generator.service.ts`, ada komentar `TECHNICAL DEBT`
   di dalam kode). Tidak aman untuk penulisan paralel/bulk. Untuk import massal,
   alokasi nomor anggota per baris dengan `count()+1` berisiko duplikat/race.
   Mitigasi yang sudah ada di buku: `INVENTORY_CREATE_RETRIES=3` — pola ini wajib
   ditiru untuk memberNumber (retry + cek `existsByMemberNumber`).
2. **Stack member ganda (legacy vs baru).** `electron/main/services/member.service.ts`
   dan `electron/main/repositories/member.repository.ts` adalah duplikat lama yang
   **tidak terpakai** (`members.search` = 0 panggilan di `src/`). Pola yang sama
   dengan stack borrowing lama (WO-007) yang terbukti menyebabkan bug. Bila import
   anggota dibangun di `src/main/`, sisa legacy ini harus dibersihkan atau
   dipertahankan secara sadar.
3. **`@map` bridge** (`number`/`birthplace`) — utang schema lama, belum dibersihkan.

### 8.2 Akan muncul bila menyalin pipeline Buku mentah-mentah

4. **Dua stack import paralel (buku vs anggota)** — biaya maintenance ganda bila
   tidak digenericize (mis. validasi enum yang belum didukung engine → duplikasi).
5. **Defect Buku yang ikut tersalin** (dari UAT WO-3): B1 (baris gagal tidak
   tampil ke user — `imports:match` resolve tanpa throw), B2 (auto-create berjalan
   sebelum deteksi duplikat → entitas yatim), B3 (tanpa pesan per baris). Bila
   member import mengikuti pola sama, kelemahan ini terulang.
6. **Validasi enum belum didukung** — memberType/gender/status butuh allowlist;
   engine saat ini hanya string/number/date + min/max. Bila dipaksakan akan muncul
   kebiasaan validasi di renderer (dilarang PO).

---

## 9. Risk Assessment

| # | Risiko | Tingkat | Mitigasi |
|---|--------|---------|----------|
| 1 | **Alokasi `memberNumber` bulk** via `count()+1` → duplikat | TINGGI | Alokasi sekuensial dalam satu transaksi + retry uniqueness (`INVENTORY_CREATE_RETRIES` pattern); atau allokasi sebelum `createMany` |
| 2 | **Matching kelas komposit.** `Class` diidentifikasi oleh 4 dimensi (academicYearId, curriculumId, educationLevel, parallel) + `@@unique`. Satu kolom "Kelas" (mis. "X MIPA 1") butuh parser + matcher 4-dimensi; ambigu saat ada 2 tahun ajaran aktif | TINGGI | Buat `PrismaClassMatchProvider`; tampilkan pilihan/konfirmasi kelas di preview; default akademik-tahun aktif |
| 3 | **Semantik parsial vs all-or-nothing.** Import Buku bersifat partial-success (baris gagal dilewati). PO bisa menuntut transaksi penuh untuk anggota | SEDANG | Keputusan PO: partial (like Buku) vs all-or-nothing (`runTransaction` seluruh baris) |
| 4 | **Dedup identitas.** NISN/NIP/NUPTK/NIK unik; data Excel kotor (spasi, format) bisa menabrak unique | SEDANG | Normalisasi (trim/lower) + deteksi duplikat antar-baris dalam file + terhadap DB sebelum insert |
| 5 | **Validasi enum** (SISWA/GURU/UMUM, LAKI_LAKI/PEREMPUAN, status) | SEDANG | Allowlist di validation layer (main), bukan renderer |
| 6 | **Parsing tanggal lahir** (`birthDate`) | RENDAH | `WorkbookReaderService` sudah menangani cell date; format cell perlu standar |
| 7 | **Packaging template** — template anggota tidak terkemas di `app.asar` bila `electron-builder.yml` tidak di-update | SEDANG | Tambah file template anggota ke `extraResources` (pola yang sama seperti buku) |
| 8 | **Legacy member stack** ikut terpakai secara keliru | RENDAH | Jangan wire ke channel baru; bersihkan jika didelegasikan |

---

## 10. Production Readiness Assessment

**TIDAK PRODUCTION-READY — fitur Import Anggota TIDAK ADA sama sekali.**

Bukti (inspeksi source, bukan asumsi):
- 0 match grep untuk seluruh terminologi import-anggota di repo.
- `src/pages/` hanya punya `BookImportPage`/`BookImportPreviewPage` — tanpa varian anggota.
- `src/routes/index.tsx` + `ROUTES` di `src/utils/navigation.ts` tidak punya route import anggota.
- `src/main/services/` tidak punya `member-import.service.ts`.
- `electron/ipc/member.ipc.ts` hanya channel CRUD; `imports:match` milik buku.
- `templates/` hanya berisi template Buku.
- `MemberListPage.tsx` hanya tombol "+ Tambah" — tanpa pintu masuk import.
- `src/utils/labels.ts` blok `IMPORT` = teks Buku; `env.d.ts` blok `imports` = match/downloadTemplate buku.

Kemiripan arsitektur pipeline Buku sangat tinggi sehingga implementasi dapat
mengikuti pola yang sama, tetapi tidak ada artefak anggota yang dapat diaktifkan.

---

## 11. Recommendations

1. **Posisi: fitur BARU end-to-end**, bukan aktivasi. Estimasi 10-14 artefak baru
   (UI 2, route+nav+labels, template config, file .xlsx, service, bulk repo,
   provider+strategi, IPC+preload+env.d.ts, DTO, builder packaging).
2. **Pertahankan pola arsitektur Buku** sebagai blueprint (Workflow → Validation →
   Matching → Auto Create → Persist) dengan domain Anggota, JANGAN menyalin
   file buku (hindari stack paralel).
3. **Putuskan 3 hal sebelum implementasi:**
   a. **Semantik kegagalan:** partial-success (like Buku) atau all-or-nothing?
   b. **Skema kolom template anggota** — khususnya representasi Kelas (1 kolom teks
      "X MIPA 1" vs kolom terpisah pendidikan/paralel + default tahun ajaran).
   c. **Default status** — konsisten dengan `create()` (`INACTIVE`).
4. **Wajib mengatasi** alokasi `memberNumber` bulk + dedup identitas (risk #1/#4)
   sebagai prasyarat teknis.
5. **Tambahkan support allowlist enum** di validation engine (perluasan kecil,
   tidak mengubah kontrak buku).
6. **Bersihkan legacy member stack** (`electron/main/services/member.service.ts`,
   `electron/main/repositories/member.repository.ts`) atau keluar dari scope
   dengan keputusan eksplisit.
7. **Update `electron-builder.yml`** saat template anggota dibuat.
8. Setelah keputusan PO, buat WO implementasi terpisah dengan UAT + lint + build +
   fresh-DB migrate deploy (prosedur baku per AGENTS.md).

---

## 12. Jawaban 10 Pertanyaan PO (berbasis bukti source)

1. **Apakah komponen Import Anggota sudah tersedia?** TIDAK. 0 artefak member-import.
2. **Apakah arsitektur Import Buku dapat digunakan kembali?** YA — sebagai pola
   arsitektur & komponen generik (parser, validation engine, matching engine,
   transaksi, dropzone, types). Lapisan domain Buku tidak.
3. **Komponen mana yang tersedia untuk reuse?** §5.1 (11 item) — infra generik +
   pola. 
4. **Komponen mana yang harus dibangun baru?** §4 (15 item) — semua artefak domain anggota.
5. **Apa risiko pengembangan?** §9 — utama: alokasi memberNumber bulk, matching
   kelas komposit, semantik parsial vs transaksi penuh, dedup identitas, enum,
   packaging template.
6. **Tech debt apa yang muncul?** §8 — penguatan NumberGeneratorService, duplikasi
   stack bila menyalin Buku, penularan defect B1/B2, validasi enum, @map bridge.
7. **Perlu perubahan database?** TIDAK. Model Member + index unik sudah ada.
8. **Perlu migrasi database?** TIDAK ada yang diwajibkan. (Cleanup `@map` M7/M8
   adalah keputusan terpisah, bukan syarat.)
9. **Perlu template Excel baru?** YA — `templates/Template_Import_Anggota_v1.0.xlsx`
   + update `electron-builder.yml` (sekarang filter hanya file buku).
10. **Perlu dependency baru?** TIDAK. `read-excel-file@^9.3.5` sudah tersedia dan
    terpakai di jalur renderer.
