# WO13_1_ENUM_DISCOVERY_REPORT.md

Work Order: **WO-13.1 — Enum Discovery Audit**
Mode: READ ONLY — audit & discovery, **tidak ada implementasi, tidak ada migration, tidak ada commit.**
Date: 2026-07-31
Tools: Prisma CLI 5.22.0 (SQLite), tsconfig node+web, grep audit seluruh codebase.

---

## 1. TEMUAN UTAMA (WAJIB DIBACA DULU)

> **Prisma TIDAK mendukung `enum` pada connector SQLite.**

Diverifikasi langsung via `prisma validate` terhadap schema probe temp:

```
Error code: P1012
Error validating: You defined the enum `BookCopyStatus`. But the current
connector does not support enums.
```

Konsekuensi:
- **Konversi menjadi "Prisma Enum" sebagaimana istilah work order TIDAK DAPAT dilakukan** selama aplikasi memakai `provider = "sqlite"` (`prisma/schema.prisma:6-8`).
- Opsi realistis:
  1. **Enum-like hardening** (tetap `String`, tambah disiplin enum): konstanta bersama + validasi runtime di service + DB `CHECK` constraint via migration manual + union type di DTO. Ini yang paling aman dan bisa dikerjakan sekarang.
  2. **Migrasi engine database** ke PostgreSQL/MySQL → barulah `enum` Prisma asli bisa dipakai. Ini perubahan infrastruktur besar (bukan cakupan sekarang).
- Karena itu seluruh bagian "rekomendasi urutan" di bawah diformulasikan sebagai **disiplin enum** (opsi 1), bukan `enum` Prisma literal — kecuali keputusan arsitektur pindah engine database diambil.

---

## 2. INVENTARIS SELURUH FIELD `String` PADA SCHEMA

### 2.1 Field string domain (bernilai terkontrol / status / tipe)

| Model | Field | Nilai yang digunakan | Default |
|-------|-------|----------------------|---------|
| `Member` | `memberType` | **Inkonsisten** — komentar schema: `SISWA \| GURU \| UMUM`; kode aktual: `student \| teacher \| general` | `null` |
| `Member` | `gender` | **Inkonsisten** — komentar schema: `LAKI_LAKI \| PEREMPUAN`; kode aktual: `male \| female` | `null` |
| `Member` | `status` | **KASUS CAMPUR** — service create: `'INACTIVE'` (uppercase); form update: `'active' \| 'inactive'` (lowercase); renderer memakai `=== 'ACTIVE'`, `=== 'active'`, dan workaround `.toLowerCase() === 'active'` | `@default("INACTIVE")` |
| `Class` | `educationLevel` | Komentar schema: `X \| XI \| XII`; **tidak ada UI/validasi**, hanya ditampilkan `"{educationLevel} {parallel}"` | — |
| `BookCopy` | `condition` | `GOOD \| LIGHT_DAMAGE \| HEAVY_DAMAGE` | `@default("GOOD")` |
| `BookCopy` | `status` | `AVAILABLE \| BORROWED \| LOST \| REMOVED` (`LOST` belum pernah ditulis) | `@default("AVAILABLE")` |
| `BookCopy` | `acquisitionSource` | `PEMBELIAN \| DONASI \| HIBAH \| BANTUAN_PEMERINTAH \| LAINNYA` (WO13-R1) | `null` |
| `AssetEvent` | `eventType` | `COPY_CREATED \| CONDITION_CHANGED` | — |
| `AssetEvent` | `actorType` | `SYSTEM \| USER` | — |
| `BorrowDetail` | `conditionBack` | `BAIK \| RUSAK \| HILANG` (Indonesia, DTO `ReturnCondition`) — **beda kosakata** dengan `BookCopy.condition` | `null` |
| `Setting` | `reportPaperSize` | `A4 \| A3 \| A5 \| Letter \| Legal` (dropdown SettingsPage) | `@default("A4")` |
| `Setting` | `reportDateFormat` | `DD/MM/YYYY \| MM/DD/YYYY \| YYYY-MM-DD \| DD Month YYYY` (dropdown) | `@default("DD/MM/YYYY")` |

### 2.2 Field string bebas (tetap String — bukan kandidat)

| Model | Field |
|-------|-------|
| `AcademicYear` | `name` |
| `Curriculum` | `name` |
| `Author` | `name` |
| `Publisher` | `name` |
| `Category` | `code`, `name`, `description` |
| `Member` | `memberNumber`, `fullName`, `nisn`, `nip`, `nuptk`, `nik`, `birthPlace`, `address`, `phone`, `email` |
| `Book` | `isbn`, `title`, `description` |
| `BookCopy` | `inventoryNumber`, `barcode`, `shelfLocation`, `acquisitionSourceDetail`, `acquisitionNotes`, `notes` |
| `AssetEvent` | `actorId`, `metadata`, `notes` |
| `Borrow` | `borrowNumber`, `notes`, `memberName`, `memberNumber`, `className` |
| `BorrowDetail` | `note`, `bookTitle` |
| `InventorySequence` | `prefix` |
| `Setting` | `libraryName`, `schoolName`, `address`, `phone`, `email`, `website`, `logoPath`, `principalName`, `principalNip`, `librarianName`, `librarianNip`, `inventoryPrefix`, `defaultShelfLocation`, `barcodeFormat`, `reportSigner` |

### 2.3 Status yang TIDAK tersimpan (derived — bukan kandidat)

- **Borrow** tidak punya kolom status. `status: 'COMPLETED' | 'ACTIVE'` dihitung dari `returnDate` di `src/main/services/borrow.service.ts:83,111` dan `return.service.ts:61`.
- **BorrowDetail item status** `'RETURNED' | 'BORROWED'` juga derived dari `returnedAt` (`borrow.service.ts:40`, `return.service.ts:19`).
- Konstanta `BorrowingStatus`, `BorrowingItemStatus`, `MemberStatus` di `electron/main/shared/borrowing-status.ts` **tidak di-import oleh kode mana pun (dead code)**.

---

## 3. PENGELOMPOKAN

### A. Layak menjadi enum (disiplin enum — set tertutup, kosakata sudah konsisten)

| # | Model.Field | Alasan |
|---|-------------|--------|
| A1 | `BookCopy.condition` | Set tertutup & terkontrol; konstanta + validasi sudah ada |
| A2 | `BookCopy.status` | Set tertutup; konstanta + state-transition sudah ada |
| A3 | `AssetEvent.eventType` | Set kecil tertutup; konstanta + single-writer |
| A4 | `AssetEvent.actorType` | Set kecil tertutup; konstanta + single-writer |
| A5 | `BookCopy.acquisitionSource` | Set tertutup (WO13-R1); validasi sudah ada |

### B. Tetap String (grup 2.2 + identifier + nama + alamat + deskripsi + catatan)

Seluruh item di §2.2. Tidak ada nilai tambah enum (free text / identifier / data referensial).

### C. Perlu diskusi / normalisasi dulu

| # | Model.Field | Alasan |
|---|-------------|--------|
| C1 | `Member.status` | **Kasus nilai campuran** `ACTIVE`/`active` di DB — harus normalisasi data dulu + putuskan bentuk kanonik |
| C2 | `Member.memberType` | Kosakata tidak konsisten antara komentar schema vs kode; plus bug prefix di NumberGenerator |
| C3 | `Member.gender` | Kosakata tidak konsisten (komentar schema vs kode `male/female`) |
| C4 | `BorrowDetail.conditionBack` | Konflik kosakata dengan `BookCopy.condition` (BAIK/RUSAK/HILANG vs GOOD/LIGHT_DAMAGE/HEAVY_DAMAGE); perlu keputusan unifikasi |
| C5 | `Class.educationLevel` | Tidak ada UI/validasi; perlu keputusan kosakata |
| C6 | `Setting.reportPaperSize` / `reportDateFormat` | Set tertutup tapi hanya config display; nilai enum rendah kecuali ada logic branching |
| C7 | `AssetEvent.eventType` (ekspansi) | Set saat ini kecil, tapi kemungkinan bertambah (event `LOST`, `RETURNED`, dll.) — putuskan batas sebelum dibekukan |

---

## 4. DETAIL KANDIDAT ENUM

Format per kandidat: model · field · nilai · lokasi validasi · service · repository · DTO · IPC · renderer · migration risk.

### A1. `BookCopy.condition`

- **Nilai:** `GOOD`, `LIGHT_DAMAGE`, `HEAVY_DAMAGE`
- **Validasi (lokasi):** `electron/main/services/book-copy.service.ts:21-25` (`VALID_CONDITIONS`) + check di `addCopies` (:71). Stack baru tidak menulis field ini.
- **Service terdampak:** `electron/main/services/book-copy.service.ts` (tulis), `src/main/services/book-copy.service.ts` (baca), `electron/main/services/inventory.service.ts` (filter baca).
- **Repository:** `src/main/repositories/book-copy.repository.ts` (`condition?: string` di `CreateBookCopyData`); `electron/main/repositories/inventory.repository.ts` (filter).
- **DTO:** `CreateBookCopiesDTO.condition?: string` (`src/shared/dto/book.ts:68`).
- **IPC:** `bookCopies:addCopies` (lewat DTO), `inventory:findMany` (`params.condition?: string`, `electron/ipc/inventory.ipc.ts`).
- **Renderer:** dropdown kondisi `BookDetail.tsx` (nilai `GOOD/LIGHT_DAMAGE/HEAVY_DAMAGE`); `InventoryPage.tsx` `CONDITION_LABEL` + filter; `InventoryDetailPage.tsx` `CONDITION_LABEL`.
- **Migration risk:** RENDAH. Kosakata konsisten; default `'GOOD'`. Untuk disiplin enum perlu audit data (kemungkinan ada nilai lama/arkib) + migration CHECK.

### A2. `BookCopy.status`

- **Nilai:** `AVAILABLE`, `BORROWED`, `LOST`, `REMOVED` (writer saat ini hanya AVAILABLE/BORROWED/REMOVED; `LOST` belum pernah ditulis).
- **Validasi:** `electron/main/services/book-copy.service.ts:14-19` `ALLOWED_TRANSITIONS` + `validateStatusTransition` (:222). Tulis langsung via literal di `src/main/repositories/borrow.repository.ts:143,176` (`'BORROWED'`, `'AVAILABLE'`).
- **Service terdampak:** `electron/main/services/book-copy.service.ts` (decommission), `src/main/services/borrow.service.ts` (`bc.status !== 'AVAILABLE'` :157), `src/main/services/return.service.ts` (via repo).
- **Repository:** `src/main/repositories/book-copy.repository.ts` (find/filter), `borrow.repository.ts` (`updateMany status`), `src/main/repositories/borrow-detail.repository.ts` (findActiveByBookCopyId).
- **DTO:** tidak diekspos sebagai input (read-only di `BookCopyDTO`).
- **IPC:** `inventory:findMany` (`params.status?: string`), `bookCopies:findByBarcode` (return status), `bookCopies:addCopies` (set AVAILABLE).
- **Renderer:** `BookDetail.tsx` `STATUS_STYLES`; `InventoryPage.tsx` `STATUS_LABEL/COLOR` + filter; `InventoryDetailPage.tsx` `STATUS_LABEL/COLOR`; `BorrowingsPage.tsx:93` `copy.status !== 'AVAILABLE'`.
- **Migration risk:** RENDAH-MEDIUM. Nilai konsisten; `LOST` belum dipakai (keputusan: pertahankan sebagai anggota enum untuk transisi masa depan).

### A3. `AssetEvent.eventType`

- **Nilai:** `COPY_CREATED`, `CONDITION_CHANGED` (saat ini).
- **Validasi:** konstanta `electron/main/shared/asset-event-type.ts`; tidak ada validasi runtime selain tipe.
- **Service terdampak:** `electron/main/services/book-copy.service.ts` (satu-satunya writer, :144, :212); `electron/main/services/asset-event.service.ts` (baca).
- **Repository:** `electron/main/repositories/asset-event.repository.ts` (`eventType: string`).
- **DTO:** tidak ada DTO input; return via env.d.ts `assetEvents.findByBookCopyId` (`eventType: string`).
- **IPC:** `assetEvents:findByBookCopyId` (`electron/ipc/asset-event.ipc.ts`); preload `electron/preload/asset-event.preload.ts`.
- **Renderer:** `InventoryDetailPage.tsx` `EVENT_LABEL` + `getEventIcon`.
- **Migration risk:** RENDAH. Single-writer, set kecil. Pertimbangkan ekspansi event (`LOST`, `BORROWED`, `RETURNED`, `DECOMMISSIONED`) sebelum dibekukan (lihat C7).

### A4. `AssetEvent.actorType`

- **Nilai:** `SYSTEM`, `USER`.
- **Validasi:** konstanta `electron/main/shared/actor-type.ts`; tidak ada runtime check.
- **Service terdampak:** `electron/main/services/book-copy.service.ts` (:145 SYSTEM, :213 USER); `asset-event.service.ts` (baca).
- **Repository:** `electron/main/repositories/asset-event.repository.ts` (`actorType: string`).
- **DTO / IPC / Renderer:** env.d.ts `assetEvents.findByBookCopyId`; `InventoryDetailPage.tsx` `ACTOR_LABEL`.
- **Migration risk:** RENDAH. Set 2 nilai, single-writer.

### A5. `BookCopy.acquisitionSource`

- **Nilai:** `PEMBELIAN`, `DONASI`, `HIBAH`, `BANTUAN_PEMERINTAH`, `LAINNYA`.
- **Validasi:** `electron/main/services/book-copy.service.ts:27-29` `VALID_ACQUISITION_SOURCES` + check di `addCopies` (WO13-R1). Nullable.
- **Service terdampak:** `electron/main/services/book-copy.service.ts` (tulis). Tidak ada service lain yang menulis.
- **Repository:** `src/main/repositories/book-copy.repository.ts` (`acquisitionSource?: string`).
- **DTO:** `CreateBookCopiesDTO.acquisitionSource?: string` (`src/shared/dto/book.ts:70`).
- **IPC:** `bookCopies:addCopies` (lewat DTO).
- **Renderer:** `BookDetail.tsx` dropdown (`LABELS.ACQUISITION_SOURCES`); `InventoryDetailPage.tsx` `ACQUISITION_SOURCE_LABEL` (+ blok Detail saat LAINNYA).
- **Migration risk:** RENDAH. Nilai terkontrol sejak WO13-R1, tapi data pra-R1 bisa berisi free text di kolom — audit data diperlukan sebelum CHECK constraint.

### C1. `Member.status` (BUTUH NORMALISASI)

- **Nilai aktual (kemungkinan campur):** `'INACTIVE'` (service create), `'active'/'inactive'` (form update), `'ACTIVE'` (dibandingkan di borrow.service).
- **Lokasi perbandingan:** `src/main/services/member.service.ts:104` (tulis `'INACTIVE'`), `:132` (`status: input.status`); `src/main/services/borrow.service.ts:131` (`!== 'ACTIVE'`); `src/pages/BorrowingsPage.tsx:256` (`=== 'active'`); `src/pages/MemberDetailPage.tsx:71` (`toLowerCase() === 'active'` — workaround); `src/pages/MembersPage.tsx:109` & `MemberListPage.tsx:115` (`=== 'ACTIVE'`); `MemberForm.tsx:70` (default `'active'`); `src/utils/labels.ts:219-222` (`MEMBER_STATUSES` lowercase).
- **Service terdampak:** `member.service.ts` (stack baru), `borrow.service.ts`, legacy `electron/main/services/member.service.ts` (baca saja).
- **Repository:** `src/main/repositories/member.repository.ts` (create/update data).
- **DTO:** `MemberDTO.status: string`; `UpdateMemberDTO.status?: string` (`src/shared/dto/member.ts:24,59`).
- **IPC:** `members:create/update/findMany` (passthrough).
- **Renderer:** form member (status), daftar/halaman detail member, halaman peminjaman.
- **Migration risk:** TINGGI. Harus normalisasi nilai (`UPDATE ... SET status = UPPER(status)` atau sebaliknya) sebelum menambahkan CHECK/constraint apa pun, lalu selaraskan semua literals & konstanta ke bentuk kanonik.

### C2. `Member.memberType`

- **Nilai aktual:** `student`, `teacher`, `general` (renderer/service). Komentar schema `SISWA|GURU|UMUM` tidak cocok.
- **Validasi:** TIDAK ADA runtime validation; hanya dropdown UI + tipe string.
- **Bug terkait:** `src/main/services/number-generator.service.ts:24` memeriksa `memberType === 'GURU'` / `'UMUM'` — **tidak akan pernah cocok** dengan nilai tersimpan `'teacher'`/`'general'`, sehingga anggota guru/umum mendapat prefix `S-` (bug laten).
- **Lokasi:** labels.ts `MEMBER_TYPES` (lowercase); `MEMBER_TYPE_LABEL` diduplikasi di `MembersPage.tsx`, `MemberListPage.tsx`, `MemberDetailPage.tsx`; `MemberForm.tsx` const `MEMBER_TYPES`; route props (`members/students|teachers|general`).
- **Migration risk:** MEDIUM-TINGGI. Perlu memilih bentuk kanonik, normalisasi data, perbaiki bug prefix, dan konsolidasi label duplikat.

### C3. `Member.gender`

- **Nilai aktual:** `male`, `female` (labels.ts `GENDERS`, form). Komentar schema `LAKI_LAKI|PEREMPUAN` tidak cocok.
- **Validasi:** TIDAK ADA runtime validation.
- **Lokasi:** `MemberForm.tsx` (dropdown), `MemberDetailPage.tsx` `GENDER_LABEL`, DTO `MemberDTO.gender`, `member.service.ts` passthrough.
- **Migration risk:** RENDAH-MEDIUM (butuh normalisasi bila ada nilai lama).

### C4. `BorrowDetail.conditionBack`

- **Nilai:** `BAIK`, `RUSAK`, `HILANG` — didefinisikan sebagai `ReturnCondition` di `src/shared/dto/borrowing.ts:57`, dikirim dari `ReturnsPage.tsx` (`CONDITIONS`), disimpan `borrow.repository.ts:169` tanpa runtime validation.
- **Konflik:** kosakata berbeda dengan `BookCopy.condition` (BAIK/RUSAK/HILANG vs GOOD/LIGHT_DAMAGE/HEAVY_DAMAGE). Dua kosakata kondisi dalam satu aplikasi; `print.service.ts:62` mencetak `conditionBack` mentah.
- **Migration risk:** MEDIUM. Keputusan unifikasi kosakata (atau biarkan terpisah) harus diambil sebelum dibekukan.

### C5. `Class.educationLevel`

- **Nilai (komentar schema):** `X`, `XI`, `XII`. **Tidak ada UI pembuat kelas** (tidak ada ClassForm/ClassPage); hanya service/repo/IPC (`classes:*`) + ditampilkan di `MemberDetailPage.tsx:86`, `MemberListPage.tsx:124`, `MembersPage.tsx:118` sebagai `"{educationLevel} {parallel}"`.
- **Migration risk:** MEDIUM — data low-risk (belum ada writer UI), tapi kosakata belum diputuskan dan UI belum ada.

### C6. `Setting.reportPaperSize` / `reportDateFormat`

- **Nilai:** dropdown `SettingsPage.tsx:31-32` (`PAPER_SIZES`, `DATE_FORMATS`). Tidak ada logic branching pada nilai ini selain display.
- **Migration risk:** RENDAH tapi nilai tambah enum rendah (config passthrough). Defer.

---

## 5. REKOMENDASI URUTAN IMPLEMENTASI

> Penerjemahan "Prisma Enum" → **disiplin enum** (konstanta bersama + validasi runtime + literal union type di DTO + DB `CHECK` constraint via migration manual). Jika keputusan arsitektur berubah ke PostgreSQL/MySQL, urutan yang sama tetap berlaku dan bisa menjadi `enum` Prisma asli.

### Fase 1 — PALING AMAN, dikerjakan lebih dahulu (set tertutup, writer tunggal, nilai sudah konsisten)
1. **`BookCopy.condition`** (A1)
2. **`BookCopy.status`** (A2)
3. **`AssetEvent.eventType`** (A3)
4. **`AssetEvent.actorType`** (A4)
5. **`BookCopy.acquisitionSource`** (A5)

Alasan: kosakata sudah konsisten lintas layer, konstanta sudah ada, single-writer, perubahan bersifat lokal (service penulis + renderer label). Risiko regresi rendah. Setiap langkah: audit nilai di DB → migration `CHECK` manual (SQLite tidak punya native enum) → sentralkan konstanta → ganti string literal dengan konstanta → selaraskan env.d.ts/DTO.

### Fase 2 — normalisasi dulu, baru disiplin enum
1. **`Member.status`** (C1) — WAJIB normalisasi case dulu, lalu perbaiki semua perbandingan (hilangkan workaround `toLowerCase`).
2. **`Member.memberType`** (C2) — putuskan kosakata kanonik, normalisasi data, **perbaiki bug prefix NumberGenerator**, konsolidasi label.
3. **`Member.gender`** (C3) — normalisasi data bila ada nilai lama, sentralkan label.

### Fase 3 — DITUNDA / diskusi
1. **`BorrowDetail.conditionBack`** (C4) — putuskan unifikasi kosakata kondisi (rekomendasi: satukan dengan `BookCopy.condition`).
2. **`Class.educationLevel`** (C5) — tunggu UI modul akademik selesai + keputusan kosakata.
3. **`Setting.reportPaperSize`/`reportDateFormat`** (C6) — nilai tambah rendah; skip kecuali ada logic branching.
4. **Ekspansi `AssetEvent.eventType`** (C7) — putuskan daftar event final sebelum membekukan.

---

## 6. TEMUAN TAMBAHAN (di luar kandidat, layak dicatat)

1. **`Member.status` kasus campuran**: bug nyata yang dipaparkan di C1 — `MemberDetailPage.tsx:71` memakai `.toLowerCase()` sebagai workaround. Prioritas tinggi untuk dibersihkan terlepas dari inisiatif enum.
2. **Bug prefix nomor anggota**: `number-generator.service.ts:24` membandingkan `'GURU'/'UMUM'` terhadap nilai `'teacher'/'general'` → semua anggota mendapat prefix `S-`.
3. **Dua kosakata kondisi**: `conditionBack` (BAIK/RUSAK/HILANG) vs `BookCopy.condition` (GOOD/LIGHT_DAMAGE/HEAVY_DAMAGE).
4. **Dead code**: `BorrowingStatus`, `BorrowingItemStatus`, `MemberStatus` di `electron/main/shared/borrowing-status.ts` tidak di-import siapa pun.
5. **`BookCopyStatus.LOST`** didefinisikan + ada di transisi map tapi tidak pernah ditulis oleh flow mana pun.
6. **Label duplikat**: `MEMBER_TYPE_LABEL` / `GENDER_LABEL` diulang di 3-4 file renderer alih-alih satu sumber.
7. **Komponen `Section`** di `BookForm.tsx` dan konstanta legacy lainnya sudah dibersihkan di WO13; tidak ada temuan baru di sana.

---

## 7. KESIMPULAN

- **9 field String domain** teridentifikasi; 5 masuk Grup A (aman, prioritas 1), 3-4 masuk Grup C (perlu diskusi/normalisasi), sisanya Grup B (tetap String).
- **Penghalang utama:** Prisma 5.22 + SQLite **tidak mendukung `enum`** (P1012, terverifikasi). Rekomendasi pelaksanaan adalah **disiplin enum** (konstanta + validasi + CHECK constraint), atau menunda sampai keputusan engine database.
- Prioritas pertama yang paling aman: `BookCopy.condition`, `BookCopy.status`, `AssetEvent.eventType`, `AssetEvent.actorType`, `BookCopy.acquisitionSource`.
- Prioritas tertunda: `Member.status` (butuh normalisasi case), `Member.memberType` (plus bug prefix), `Member.gender`, `conditionBack`, `educationLevel`, setting config.
