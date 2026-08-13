# MEMBER BORROWING RIGHTS AUDIT

**Modul:** Peminjaman (Borrow) — Hak Pinjam per Tipe Anggota
**Tipe:** Audit read-only (tanpa perubahan kode/DB)
**Tanggal:** 2026-08-13
**Status:** DONE — READY review PO

---

## 1. Executive Summary

Konfigurasi hak pinjam per tipe anggota (`src/shared/config/member-type.ts` — SISWA 2 buku/7 hari/1x, GURU 5 buku/30 hari/3x, UMUM 10 buku/90 hari/Tidak Terbatas) **hanya berfungsi sebagai display di UI** (RightsSidebar, RightsCard MemberDetailPage, MemberForm). **Tidak ada satu pun komponen hak tersebut yang di-enforce di backend maupun di UI alur peminjaman.**

- Batas jumlah buku yang benar-benar diberlakukan di service adalah **`MAX_BOOKS = 20` yang di-hardcode** (`src/main/services/borrow.service.ts:13`) untuk **semua tipe anggota** — BUKAN 2/5/10.
- **Batas lama pinjam (`maxDays`) TIDAK di-enforce sama sekali** — `dueDate` diambil dari input user (`CreateBorrowingInput`), service hanya memvalidasi `dueDate > now`.
- **Perpanjangan (`extensions`) TIDAK ada fiturnya** — tidak ada DTO/IPC/UI renewal; `Setting.allowRenewal` dan `Setting.maxBorrowBooks`/`defaultBorrowDays` adalah field dormant (FULL_AUDIT_REPORT.md:66).
- **Eligibility (boleh pinjam) sudah benar** dan diuji (`it_borrow_eligibility_smoke` 7 kasus): SISWA wajib enrollment ACTIVE; GURU/UMUM tidak butuh enrollment; tipe tidak dikenal ditolak; `Member.status` TIDAK diperiksa (INACTIVE tetap bisa pinjam; pinjam pertama mengaktifkan — perilaku disetujui PO).
- **Kesimpulan: modul peminjaman TIDAK menerapkan hak pinjam per tipe.** Gap antara yang ditampilkan (2/5/10 buku) dan yang di-enforce (20 buku) berisiko menyesatkan operasional dan tidak sesuai spesifikasi domain.

**VERDICT: NEEDS FIX** — enforcement hak pinjam (maxBooks per tipe, maxDays per tipe) belum terpasang; seluruh lapisan backend aman dari sisi transaksi (atomic guard), tetapi batas per-tipe tidak ada.

---

## 2. Source of Truth (Specifikasi Domain)

`src/shared/config/member-type.ts` (F1, config leaf — satu-satunya sumber nilai hak pinjam):

| Kode | Label | Prefix | maxBooks | maxDays | extensions | hasAcademicRecord |
|------|-------|--------|----------|---------|------------|-------------------|
| `student` | Siswa | `S` | **2** | **7** | `'1x'` | `true` |
| `teacher` | Guru | `G` | **5** | **30** | `'3x'` | `false` |
| `general` | Umum | `U` | **10** | **90** | `'Tidak Terbatas'` | `false` |

- `getMemberType()` mengembalikan `null` untuk kode invalid/absent/case-mismatch.
- `MemberTypeDefinition.borrowRights` = kontrak domain yang wajib di-enforce.

## 3. Aturan yang Sebenarnya Diberlakukan (Actual Enforcement)

### 3.1 `BorrowService.create()` — `src/main/services/borrow.service.ts`

| # | Guard | Nilai | Sumber | Keterangan |
|---|-------|-------|--------|------------|
| 1 | Member ada | 404 | `memberRepository.findById` | — |
| 2 | Tipe anggota dikenal | 400 `'Tipe anggota...'` | `getMemberType()` | `null` → ditolak |
| 3 | SISWA wajib enrollment ACTIVE | 400 `'tidak memiliki enrollment aktif'` | `enrollmentService.findActiveByMember` | HANYA jika `hasAcademicRecord === true` |
| 4 | `dueDate` wajib > sekarang | 400 | input | **TANPA cap `maxDays`** |
| 5 | ≥ 1 buku | 400 | input | — |
| 6 | Tidak ada `bookCopyId` duplikat | 400 | input | — |
| 7 | Semua `bookCopyId` ada | 404 | `bookCopyRepository.findByIds` | — |
| 8 | Semua status `AVAILABLE` | 400 `'buku tidak tersedia'` | pre-check | Bukan jaminan atomik (lihat §10) |
| 9 | **Jumlah buku ≤ 20** | 400 | **`MAX_BOOKS` hardcoded (baris 13)** | **Untuk SEMUA tipe — bukan 2/5/10** |
| 10 | Aktivasi status INACTIVE→ACTIVE | — | `memberRepository.update` | SETELAH `createWithItems` sukses (first-borrow activation) |

**Tidak diperiksa sama sekali:** `rights.maxBooks`, `rights.maxDays`, `rights.extensions`, `Setting.defaultBorrowDays`, `Setting.maxBorrowBooks`, `Member.status` (untuk GURU/UMUM maupun SISWA).

### 3.2 Jalur atomik — `BorrowRepository.createWithItems()` (IT-1)

- `updateMany({ where: { id, status: 'AVAILABLE' } })` berpredikat → count check → semua-or-tidak sama sekali.
- Menjamin **tidak ada double-borrow terhadap eksemplar yang sama** (concurrent-safe tanpa lock).
- **TIDAK menjamin batas per-anggota** — guard jumlah buku (#9) hanya pre-check count di luar transaksi (lihat §10).

## 4. Enforcement Flow

```
UI (BorrowingsPage)                        Main (BorrowService.create)
────────────────────────                   ─────────────────────────────
pilih member ──────────────▶  findById ──▶ member
barcode scan ──▶ findByBarcode(status AVAILABLE)
dueDate input (bebas, type=date) ─────────▶ guard dueDate > now  [tanpa maxDays]
isi buku (TANPA limit UI) ───────────────▶ guard <= MAX_BOOKS=20 [bukan maxBooks per tipe]
                                            guard eligibility (siswa: enrollment ACTIVE)
save ─────────────▶ createWithItems (atomic bookCopy guard)
                    INACTIVE → ACTIVE (first borrow activation)
                    ─▶ toDTO → navigate receipt-preview
```

- Renderer **tidak pernah menghitung batas hak** — `canSave` (BorrowingsPage.tsx:43) hanya `selectedMember && books.length>0 && dueDate && !saving`.
- Service menerima `bookCopyIds` apa adanya; batas hanya `MAX_BOOKS`.

## 5. Konsistensi UI vs Backend

| Aspek | UI ditampilkan | Backend di-enforce | Konsisten? |
|-------|----------------|--------------------|------------|
| maxBooks | 2/5/10 (RightsSidebar, RightsCard) | **20 (semua tipe)** | ❌ **TIDAK** |
| maxDays | 7/30/90 | **tidak ada** | ❌ **TIDAK** |
| extensions | 1x/3x/Tidak Terbatas | **tidak ada fitur renewal** | ❌ **TIDAK** |
| Eligibility siswa | `enrollments.findActiveByMember` ≠ null (BorrowingsPage:65-67) | enrollment ACTIVE | ✅ |
| Eligibility guru/umum | `member.status === 'ACTIVE'` (BorrowingsPage:62) | **tidak diperiksa** | ⚠️ **PARCIAL** — UI menampilkan "INACTIVE = tidak eligible" padahal backend meloloskan (dan mengaktifkan) |
| Status keanggotaan | badge AKTIF/NONAKTIF | tidak dipakai utk guard | ⚠️ INFO |

**Catatan kritis:** UI eligibility guru/umum memakai `selectedMember.status === 'ACTIVE'` (`BorrowingsPage.tsx:62`), sedangkan service **tidak memeriksa status sama sekali** untuk GURU/UMUM (IT-1 HOTFIX: hanya siswa yang butuh enrollment). Artinya: member UMUM berstatus `INACTIVE` ditampilkan "tidak eligible" oleh UI, tetapi `create()` berhasil (dan status diaktifkan via first-borrow activation). Ini **inkonsistensi tampilan vs perilaku** — perlu konfirmasi PO apakah label eligibility guru/umum harus mengikuti aturan service (selalu eligible, INACTIVE pun bisa).

## 6. Boundary Analysis

### Batas jumlah buku (enacted: MAX_BOOKS=20 untuk semua)

| Skenario | count aktif + buku baru | Hasil |
|----------|------------------------|-------|
| SISWA 1 aktif + 1 baru (limit spec 2) | 2 ≤ 20 | ✅ LULUS (seharusnya per spec: maksimal 2) |
| SISWA 2 aktif + 1 baru | 3 ≤ 20 | ✅ LULUS (**SEHARUSNYA DITOLAK** — melebihi 2) |
| GURU 5 aktif + 1 baru | 6 ≤ 20 | ✅ LULUS (seharusnya per spec: 5) |
| UMUM 19 aktif + 1 baru | 20 ≤ 20 | ✅ LULUS (spec: 10) |
| Semua tipe: 20 aktif + 1 baru | 21 > 20 | ❌ DITOLAK (satu-satunya batas nyata) |

### Batas lama pinjam (enacted: tidak ada)

| Skenario | dueDate | Hasil |
|----------|---------|-------|
| SISWA dueDate +8 hari (spec 7) | > now | ✅ LULUS (**SEHARUSNYA DITOLAK** per spec) |
| SISWA dueDate +90 hari | > now | ✅ LULUS |
| dueDate = hari ini / masa lalu | ≤ now | ❌ DITOLAK (guard benar) |

## 7. Buku Dikembalikan (Returned Book)

- `ReturnService` / `ReturnBookInput { bookCopyId, condition, notes? }` — item status diturunkan `returnedAt ? 'RETURNED' : 'BORROWED'` (DTO).
- `processReturn` (borrow.repository) memakai guard transisi status `canTransitionStatus` → `RETURNED` → `AVAILABLE`; `LOST` → tidak pernah kembali AVAILABLE; `REMOVED` tak pernah kembali.
- Return **tidak pernah menulis `Member.status`** — status keanggotaan tetap ACTIVE setelah semua buku kembali (disetujui PO).
- **Tidak ada hubungan dengan rights** — return tidak menambah kuota per-tipe (karena kuota per-tipe tidak ada).

## 8. Keterlambatan (Overdue)

- Status per baris diturunkan di DTO: `returnDate`/`dueDate` → ACTIVE/COMPLETED/OVERDUE (Dashboard & laporan).
- `OverdueReport` menghitung `lateDays` (tanpa nominal denda — keputusan K2).
- **Batas `maxDays` tidak memengaruhi overdue** — karena `dueDate` bebas dari input, "keterlambatan" hanya bermakna relatif terhadap tanggal jatuh tempo yang dipilih, bukan terhadap hak per tipe.

## 9. Status Keanggotaan (Member.status)

- `Member.status` `@default("INACTIVE")` — bukan guard eligibility (IT-1 HOTFIX).
- SISWA: eligibility = enrollment ACTIVE; GURU/UMUM: tanpa syarat enrollment.
- First-borrow activation: `INACTIVE → ACTIVE` setelah `createWithItems` sukses (`borrow.service.ts` blok FIRST BORROW ACTIVATION).
- Konsisten dengan WO "Membership First Borrow Activation" (disetujui PO). ⚠️ Namun UI eligibility guru/umum (`status === 'ACTIVE'`) tidak sinkron dengan aturan ini (§5).

## 10. Analisis Concurrency

| Risiko | Penilaian | Alasan |
|--------|-----------|--------|
| Double-borrow eksemplar sama | **SAFE** | `createWithItems` updateMany berpredikat `status: AVAILABLE` + count check dalam `$transaction` (IT-1) |
| Melebihi batas buku per tipe | **HIGH RISK (teoretis)** | Guard #9 = `countActiveByMemberId()` SEBELUM transaksi → dua `create()` bersamaan bisa sama-sama lolos (TOCTOU). Namun: desktop single-user + SQLite serial → risiko nyata rendah. |
| Aktivasi INACTIVE→ACTIVE | **LOW** | Update terpisah setelah tx; race antar dua pinjam bersamaan hanya membuat status ACTIVE dua kali (idempoten) |
| Melebihi batas per tipe (seandainya dipasang) | **PERLU pola atomic** | Disarankan: guard dalam `$transaction` dengan re-count via `tx` (pola `findActiveByClassesWithTx`/`countActiveByMemberId` dalam tx) |

**Klasifikasi: LOW–MEDIUM secara keseluruhan** (aplikasi desktop single-user; jalur ganda `create()` nyaris mustahil lewat UI). Poin utama bukan race, melainkan **tidak adanya batas per-tipe sama sekali**.

## 11. Existing Test Coverage

### `it_borrow_eligibility_smoke/smoke.ts` — 7 kasus (semua PASS di CI)

| Kasus | Hasil | Verdict |
|-------|-------|---------|
| 1. SISWA + enrollment ACTIVE | ✅ pinjam OK | sesuai |
| 2. SISWA + GRADUATED | ❌ ditolak `'tidak memiliki enrollment aktif'` | sesuai |
| 3. SISWA + TRANSFERRED | ❌ ditolak | sesuai |
| 4. SISWA + DROPPED | ❌ ditolak | sesuai |
| 5. GURU tanpa enrollment | ✅ pinjam OK | sesuai |
| 6. UMUM tanpa enrollment | ✅ pinjam OK | sesuai |
| 7. Tipe tidak dikenal (`vendor`) | ❌ ditolak `'Tipe anggota'` | sesuai |

### Coverage yang TIDAK ada

- ❌ **Tidak ada test untuk batas `MAX_BOOKS=20`** (tidak ada case 21+ buku).
- ❌ **Tidak ada test untuk `maxBooks` per tipe** (2/5/10) — karena memang tidak di-enforce.
- ❌ **Tidak ada test untuk `maxDays`** / cap dueDate per tipe.
- ❌ **Tidak ada test perpanjangan (renewal)** — fitur tidak ada.
- ✅ Guard transaksi (double-borrow atomik, no-resurrection) diuji `it1_borrow_return_smoke` 34 case.

## 12. Findings

| ID | Severity | Temuan | Bukti |
|----|----------|--------|-------|
| F1 | **HIGH** | `MAX_BOOKS=20` hardcoded untuk SEMUA tipe; `rights.maxBooks` (2/5/10) tidak di-enforce | borrow.service.ts:13; member-type.ts:20/27/34 |
| F2 | **HIGH** | `rights.maxDays` (7/30/90) tidak di-enforce; `dueDate` bebas dari input selama > now | borrow.service.ts guard #4; BorrowingsPage.tsx:144 |
| F3 | **MEDIUM** | `extensions` (1x/3x/Tidak Terbatas) tidak punya fitur — tidak ada renewal di DTO/IPC/UI; `Setting.allowRenewal` dormant | grep renewal = 0; setting.service.ts:142 |
| F4 | **MEDIUM** | UI eligibility GURU/UMUM memakai `status === 'ACTIVE'`, backend meloloskan INACTIVE (dan mengaktifkan) — label "tidak eligible" menyesatkan | BorrowingsPage.tsx:62 vs IT-1 HOTFIX |
| F5 | **MEDIUM** | UI menampilkan hak pinjam (2/5/10/7/30/90/1x/3x) yang tidak di-enforce — operasional mengira ada limit | RightsSidebar.tsx:24-25; MemberDetailPage.tsx:444-454 |
| F6 | **INFO** | `Setting.defaultBorrowDays`/`maxBorrowBooks` dormant (dokumen lain) — sumber konfigurasi ketiga yang bertabrakan dengan config F1 | FULL_AUDIT_REPORT.md:66; schema.prisma:360-361 |
| F7 | **INFO** | Guard #9 count di luar transaksi (TOCTOU teoretis) — tidak berdampak nyata di desktop single-user | borrow.service.ts + borrow.repository.ts |
| F8 | **PASS** | Eligibility siswa (enrollment ACTIVE) benar & teruji | it_borrow_eligibility_smoke case 1-4 |
| F9 | **PASS** | Atomic double-borrow guard benar & teruji | it1_borrow_return_smoke 34/34 |

## 13. Recommended Actions

1. **(BLOCKER arah kebijakan)** Konfirmasi PO: batas buku per tipe yang benar — apakah 2/5/10 (config F1) atau tetap 20. Saat ini config dan enforcement bertentangan.
2. **Enforce `maxBooks` per tipe** di `BorrowService.create` memakai `getMemberType().borrowRights.maxBooks` (ganti `MAX_BOOKS=20` atau jadikan fallback), dengan guard dalam `$transaction` (re-count via tx) untuk menghindari TOCTOU.
3. **Enforce `maxDays` per tipe**: `dueDate` dihitung/divalidasi dari `borrowDate + rights.maxDays` (atau diblokir bila `dueDate - borrowDate > maxDays`).
4. **Selaraskan UI**: (a) batas jumlah buku ditampilkan & dihitung di UI dari config yang sama (SSOT); (b) perbaiki label eligibility GURU/UMUM agar konsisten dengan aturan service (INACTIVE tetap boleh pinjam, akan diaktifkan).
5. **Putuskan nasib `Setting.defaultBorrowDays`/`maxBorrowBooks`/`allowRenewal`** (hapus vs aktifkan) — ketiganya menambah sumber konfigurasi yang tabrakan.
6. **Tambah smoke** di suite eligibility: boundary maxBooks per tipe (N-1/N/N+1), cap maxDays, dan aktivasi status INACTIVE→ACTIVE.
7. *(Opsional, backlog)* Fitur perpanjangan (renewal) bila `extensions`/`allowRenewal` ingin diaktifkan.

## 14. Final Verdict

> **NEEDS FIX**

Hak pinjam per tipe anggota (maxBooks 2/5/10, maxDays 7/30/90, extensions 1x/3x/Tidak Terbatas) **belum di-enforce**. Backend hanya menerapkan `MAX_BOOKS=20` untuk semua tipe dan tanpa batas lama pinjam. Eligibility (siswa wajib enrollment ACTIVE, tipe dikenal) dan integritas transaksi (double-borrow atomic) **sudah benar**. Perlu: (1) keputusan PO atas nilai batas; (2) enforcement `maxBooks` + `maxDays` per tipe; (3) sinkronisasi UI; (4) smoke boundary. Modul tetap berjalan tetapi tidak memenuhi spesifikasi hak pinjam yang ditampilkan.

---

# MEMBER BORROWING RIGHTS — IMPLEMENTATION REPORT

**Tanggal:** 2026-08-13
**Status:** DONE — READY review PO

## 1. Ringkasan

Menindaklanjuti audit di atas (verdict NEEDS FIX), Product Owner menetapkan keputusan kebijakan:

> **Semua tipe anggota (SISWA / GURU / UMUM) diberi `maxBooks = 20` eksemplar dan `maxDays = 90` hari.** Nilai `extensions` (1x / 3x / Tidak Terbatas) TIDAK diubah (fitur perpanjangan belum ada).

Implementasi menyamakan nilai di SSOT config, menegakkan `maxBooks` + `maxDays` di backend (service + guard atomik dalam transaksi), memastikan UI menampilkan nilai dari config (bukan hardcode), dan menambah smoke boundary. Tanpa perubahan schema/migration.

## 2. Keputusan PO

| Aspek | Keputusan |
|-------|-----------|
| `maxBooks` | **20** untuk student, teacher, general (seragam) |
| `maxDays` | **90** untuk student, teacher, general (seragam) |
| `extensions` | Tetap: student `'1x'`, teacher `'3x'`, general `'Tidak Terbatas'` |
| Sumber kebenaran | `src/shared/config/member-type.ts` (SSOT) |
| Scope | Konfigurasi + backend enforcement + UI display + smoke. TIDAK menyentuh: renewal, enrollment, cover/foto/barcode/copyCount/inventory/auth/timezone. |

## 3. Perubahan Source (3 file)

### 3.1 `src/shared/config/member-type.ts`

`borrowRights` seluruh tiga tipe diubah ke `{ maxBooks: 20, maxDays: 90 }`. `extensions` dipertahankan apa adanya. Ditambah komentar `PO Decision (MEMBER BORROWING RIGHTS)`.

### 3.2 `src/main/services/borrow.service.ts`

- Hapus konstanta hardcoded `MAX_BOOKS = 20` + komentar technical-debt.
- `const borrowDate = new Date()` dihitung sekali, dipakai untuk semua validasi tanggal.
- **Guard `maxDays`** (baru): `dueDate <= borrowDate + rights.maxDays` ACCEPT (tepat 90 hari boleh); lebih → `AppError 400 'Masa pinjam tidak boleh melebihi ${maxDays} hari'`.
- **Guard `maxBooks`** (advisory fast-fail): `activeCount + bookCopyIds.length > rights.maxBooks` → `AppError 400 'Total buku yang dipinjam tidak boleh melebihi ${maxBooks} eksemplar'`. Nilai berasal dari config, bukan literal.
- `createWithItems(..., maxBooks)` — argumen `maxBooks` diteruskan dari `memberType.borrowRights.maxBooks`.
- Guard yang tidak berubah: tipe dikenal (400), siswa wajib enrollment ACTIVE, `dueDate > now`, buku AVAILABLE, duplikat id, aktivasi INACTIVE→ACTIVE setelah transaksi sukses.

### 3.3 `src/main/repositories/borrow.repository.ts`

`createWithItems(data, items, maxBooks)` — parameter `maxBooks: number` **wajib** (baru). Di dalam `$transaction`, **SEBELUM** `tx.borrow.create`:

```
activeCount = tx.borrowDetail.count({ where: { returnedAt: null, borrow: { memberId, returnDate: null } } })
activeCount + items.length > maxBooks → throw AppError 400 (pesan yang sama)
```

Guard ini mengeliminasi TOCTOU teoretis (F7 audit): dua panggilan `create()` bersamaan tidak bisa sama-sama lolos karena re-count dilakukan di dalam transaksi yang sama dengan penulisan. Guard `AVAILABLE→BORROWED` (IT-1) dipertahankan.

## 4. Perubahan UI (verifikasi — tidak ada edit)

- `src/utils/labels.ts:13` — `MEMBER_RIGHTS_LOOKUP` me-derive dari config → otomatis menampilkan 20/90.
- `src/components/members/RightsSidebar.tsx:23-24` + `src/pages/MemberDetailPage.tsx:134,445-449` — memakai config → tampil 20/90.
- `src/pages/BorrowingsPage.tsx` — `canSave` (line 43) dan F4 eligibility display TIDAK diubah (di luar scope); tidak ada nilai 20/90 hardcoded di renderer (grep = 0 match).
- **Tidak ada business rule baru di renderer** — seluruh batas di-enforce backend.

## 5. Perubahan Smoke (3 file)

### 5.1 `it1_borrow_return_smoke/smoke.ts`

Panggilan langsung `borrowRepository.createWithItems(...)` (STEP 2, uji atomic) diberi argumen `maxBooks = 20` agar kompatibel kontrak baru.

### 5.2 `wo1_config_smoke/config.smoke.ts`

Asersi `borrowRights` diubah 2/7 → **20/90** untuk ketiga tipe; `extensions` tetap diperiksa (1x/3x/Tidak Terbatas); assertion `getMemberType('student').borrowRights.maxBooks === 20`.

### 5.3 `it_borrow_eligibility_smoke/smoke.ts` — +19 kasus (7 → 26)

- **CASE 8 — maxBooks:** 19 buku 1 transaksi → OK; +1 = 20 → OK; +1 = 21 → ditolak (`tidak boleh melebihi 20 eksemplar`); return 1 → borrow lagi OK (RETURNED tidak dihitung); 21 buku dalam SATU transaksi → ditolak.
- **CASE 8b — guard ATOMIK:** `createWithItems` langsung pada member dengan 20 detail aktif + 2 items → dibatalkan atomik; rollback terbukti (detail aktif tetap 20, 2 copy tetap AVAILABLE, tanpa penulisan parsial).
- **CASE 9 — maxDays:** +30 hari OK; **tepat 90 hari OK** (`<= maxDays`); 91 hari → ditolak (`Masa pinjam tidak boleh melebihi 90 hari`); dueDate hari ini → ditolak (`harus setelah hari ini`).
- **CASE 10 — kesetaraan tipe:** student/teacher/general semuanya `maxBooks=20` + `maxDays=90`; extensions dipertahankan.

## 6. Validation

| Gate | Hasil |
|------|-------|
| `npm run lint` (tsc node+web) | **PASS** |
| `npm run build` | **PASS** (main 2,437.34 kB · preload 13.24 kB · renderer 1,291.04 kB) |
| `wo1_config_smoke` | **46/46 PASS** |
| `it_borrow_eligibility_smoke` | **26/26 PASS** (baru: 19 kasus boundary/atomik/kesetaraan) |
| `it1_borrow_return_smoke` | **34/34 PASS** |
| `membership_first_borrow_smoke` | **20/20 PASS** |
| `wo14_e2_smoke` | **40/40 PASS** |
| `prisma migrate diff` | **"This is an empty migration."** (tidak ada perubahan schema) |
| `git status --short` | 6 file diubah (3 source + 3 smoke) + audit |

### Catatan `borrow_card_uat_smoke` (17 PASS / 14 FAIL)

Smoke ini gagal pada **14 assertion markup kartu** (sheet/row/QR/avatar/logo) — kegagalan **pre-existing** yang terdokumentasi di AGENTS.md (WO Inventory Prefix Alignment): template kartu sudah A6 (`8592dd0`) tetapi smoke terakhir di-update era kartu 110×60, sehingga assertion markup lama salah. **TIDAK terkait perubahan hak pinjam**: seluruh alur pinjam (create 20 eksemplar, findById, preview, QR payload, filename PDF, 404) PASS. Perbaikan smoke ini adalah WO terpisah di luar scope.

### Catatan tooling smoke compile

`npx tsc` langsung (tanpa project tsconfig) memakai client Prisma default di `node_modules/.prisma/client` yang **stale** (belum punya `photoPath`) → error TS2339 pada `member.service.ts`. Ini **pre-existing** (terbukti identik pada tree bersih via `git stash`). Workaround smoke: tsconfig sementara dengan `paths: { "@prisma/client": ["src/generated/prisma/index.d.ts"] }` (meniru `tsconfig.node.json`). `prisma generate` memunculkan EPERM karena query-engine DLL terkunci (aplikasi/dev berjalan) — tidak perlu regenerasi untuk WO ini.

## 7. Boundary Matrix (hasil smoke)

| Kondisi | Hasil |
|---------|-------|
| 19 eksemplar dalam 1 transaksi | ✅ ACCEPT |
| 20 eksemplar (19+1 bertahap) | ✅ ACCEPT |
| 21 eksemplar (20+1 bertahap) | ❌ `tidak boleh melebihi 20 eksemplar` |
| 21 eksemplar dalam 1 transaksi | ❌ ditolak |
| RETURNED dikembalikan → pinjam lagi | ✅ ACCEPT (returned tidak dihitung) |
| 20 aktif + 2 items via repo langsung | ❌ dibatalkan atomik (rollback) |
| dueDate +30 hari | ✅ ACCEPT |
| dueDate **tepat +90 hari** | ✅ ACCEPT |
| dueDate +91 hari | ❌ `Masa pinjam tidak boleh melebihi 90 hari` |
| dueDate hari ini / lalu | ❌ `Tanggal jatuh tempo harus setelah hari ini` |
| student/teacher/general | ✅ maxBooks 20, maxDays 90 (SSOT) |

## 8. Status Finding Audit Sebelumnya

| ID | Status |
|----|--------|
| F1 | **RESOLVED** — `MAX_BOOKS=20` dihapus; batas kini dari `rights.maxBooks` (20) |
| F2 | **RESOLVED** — `maxDays` (90) di-enforce di service |
| F5 | **RESOLVED** — UI menampilkan nilai config (20/90) yang kini benar-benar di-enforce |
| F6 | DIPERTAHANKAN — `Setting.defaultBorrowDays`/`maxBorrowBooks` dormant (di luar scope; dictatat tech-debt) |
| F7 | **RESOLVED** — guard `maxBooks` kini di-re-count dalam `$transaction` (anti-TOCTOU) |
| F3 | DIPERTAHANKAN — `extensions`/renewal tidak diaktifkan (keputusan PO, bukan bagian WO ini) |
| F4 | DIPERTAHANKAN — UI eligibility GURU/UMUM (`status === 'ACTIVE'`) di luar scope WO ini |

## 9. Pelajaran (retain)

- **Nilai batas pinjam = keputusan kebijakan PO; implementasi = SSOT config + enforcement backend + display config-derived.** Setelah keputusan "20/90 untuk semua", tidak ada lagi nilai yang bertentangan antara config dan kode.
- **Guard `maxBooks` harus atomic dalam transaksi** (`count` via `tx` sebelum tulis) untuk mengeliminasi TOCTOU teoretis; guard service (pre-tx) cukup sebagai fast-fail advisory, bukan jaminan.
- **Batas `maxDays` memakai `<=`** — "tepat 90 hari" legal; smoke membuktikan +90d diterima dan +91d ditolak. `dueDate > borrowDate` (hari ini) tetap ditegakkan terpisah.
- **Kontrak repository berubah** (`createWithItems(..., maxBooks)`) → seluruh pemanggil (service + smoke) wajib di-update bersamaan; `npm run lint` tidak menangkap pemanggil smoke (di luar tsconfig project).
- **Compile smoke perlu `paths` mapping `@prisma/client`** ke `src/generated/prisma` (client default node_modules stale terhadap schema); dokumentasikan sebagai pattern smoke compile, jangan regenerasi client saat query-engine terkunci.
- **Verifikasi regresi di-scope**: perubahan hanya menyentuh jalur pinjam + config → cukup suite borrow/dashboard/enrollment; suite markup kartu (borrow_card_uat) tetap merah karena isu pre-existing yang sudah diketahui.

## 10. Kesimpulan

Keputusan PO "20/90 semua tipe" telah diimplementasikan end-to-end: SSOT config, enforcement `maxBooks` (service + guard atomik dalam transaksi), enforcement `maxDays`, UI tampil dari config, dan smoke boundary 26 kasus. Tidak ada perubahan schema/migration. Tidak ada business rule baru di renderer. Regresi jalur pinjam, dashboard, dan enrollment seluruhnya hijau.

## 11. Final Verdict

> **BORROWING RIGHTS READY FOR UAT**


