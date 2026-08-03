# MASTER DATA AKADEMIK AUDIT

**Peran:** Production Readiness Audit — modul Master Data Akademik
**Mode:** READ ONLY — tidak ada perubahan kode, tidak ada migration, tidak ada commit.
**Status akhir:** **NOT READY** (lihat bagian 10).

---

## 1. Current Architecture

### Entity yang sudah ada (`prisma/schema.prisma`)

| Model | Field kunci | Peran |
|-------|-------------|-------|
| `AcademicYear` | `name` (unique), `startDate`, `endDate`, `isActive` | Tahun ajaran; `findActive()` memakai `isActive=true` |
| `Curriculum` | `name` (unique) | Kurikulum (mis. Merdeka) |
| `Class` | `academicYearId`, `curriculumId`, `educationLevel`, `parallel`, `homeroomTeacher`, `isActive`; `@@unique([academicYearId, curriculumId, educationLevel, parallel])` | Kelas per tahun ajaran — **entity per-tahun** |
| `Member` | `memberNumber` (unique), `nisn/nip/nuptk/nik` (unique), `classId?`, `status` (default INACTIVE) | Anggota; `classId` = penunjuk kelas **saat ini** |
| `Borrow` | snapshot `memberName`, `memberNumber`, `className` (string) | Riwayat peminjaman menyimpan snapshot kelas |

### Layer backend (sudah lengkap)
- Repository: `academic-year.repository.ts`, `curriculum.repository.ts`, `class.repository.ts`, `member.repository.ts`.
- Service: `academic-year.service.ts`, `curriculum.service.ts`, `class.service.ts`, `member.service.ts`, `member-import.service.ts`, `member-class-resolver.service.ts`, `member-duplicate-checker.service.ts`.
- IPC + preload + DTO (`src/shared/dto/academic.ts`, `member.ts`) + `env.d.ts` — semua terdaftar di `electron/ipc/index.ts`.

### Desain kelas per-tahun (sudah benar)
`Class` terikat `academicYearId` + `@@unique` komposit → setiap tahun ajaran diwakili **row baru**, bukan update row lama. Ini primitif yang benar untuk menjaga histori.

### Gap yang terkonfirmasi
- **Tidak ada UI** master data Tahun Ajaran/Kurikulum/Kelas — Sidebar "Master Data" hanya Penulis/Penerbit/Kategori (`Sidebar.tsx:33-37`), walau preload `academicYears`/`classes`/`curriculums` sudah tersedia.
- **Tidak ada Reporting** — `ReportsPage.tsx` placeholder ("dalam pengembangan"); tidak ada service report.
- **Tidak ada entity histori** anggota↔kelas — `Member.classId` adalah pointer tunggal yang bisa berubah.

---

## 2. Current Weakness

1. **Tanpa histori akademik.** `Member.classId` hanya menunjuk kelas sekarang. Saat anggota pindah/naik kelas, posisi tahun lalu hilang. Riwayat peminjaman selamat (snapshot `className` di `Borrow`), tetapi riwayat keanggotaan akademik tidak ada.
2. **Lifecycle status terbatas.** `Member.status` hanya ACTIVE/INACTIVE. Tidak ada representasi **lulus**, **pindah sekolah**, **keluar**, **tinggal kelas** secara terstruktur (hanya INACTIVE + teks bebas).
3. **Single active year tanpa guard.** `AcademicYearService.create/update` membiarkan `isActive=true` tanpa menonaktifkan tahun lain; `findActive()` mengembalikan tahun terakhir saja (silent). Resolver kelas memakai "tahun aktif" implisit → tidak bisa impor ke tahun spesifik.
4. **Tidak ada mekanisme rollover.** Tidak ada "clone kelas ke tahun baru", tidak ada promosi massal, tidak ada cara menonaktifkan tahun lama + mengaktifkan tahun baru secara transaksi.
5. **Rename kelas merusak label lama.** Mengubah `Class.parallel` mengubah tampilan untuk SEMUA anggota yang menunjuk ke kelas itu; tidak ada snapshot label kelas di Member.
6. **`educationLevel` string bebas.** X/XI/XII hanya divalidasi di resolver (`EDUCATION_LEVELS`, `member-class-resolver.service.ts:32`), bukan di schema/service — bisa masuk nilai tak dikenal.
7. **Impor tidak tahu tahun/kurikulum tujuan.** `MemberClassResolver` selalu memakai tahun aktif. Impor tidak bisa menargetkan tahun ajaran/kelas tertentu secara eksplisit.
8. **Duplikat antar-tahun.** `MemberDuplicateChecker` memblokir NISN yang sama tanpa memandang tahun → siswa yang naik kelas tidak bisa di-import ulang di tahun berikutnya (dianggap duplikat), padahal seharusnya hanya menambah enrollment baru.
9. **Reporting belum ada.** Tidak ada laporan anggota per kelas, peminjaman per kelas, statistik tahunan.

---

## 3. Required Entities

### WAJIB (inti)

**`MemberEnrollment`** — riwayat penempatan anggota di kelas per tahun ajaran.
```
id            String   @id @default(uuid())
memberId      String
classId       String
academicYearId String
status        String   // ACTIVE | GRADUATED | TRANSFERRED | DROPPED | REPEATED
enrolledAt    DateTime
leftAt        DateTime?
leftReason    String?  // NA | PROMOTED | REPEATED | TRANSFERRED | DROPPED | REDISTRIBUTED | RENAMED
note          String?
createdAt     DateTime @default(now())

@@unique([memberId, academicYearId])   // 1 penempatan per tahun per anggota
@@index([classId])
@@index([academicYearId])
```

### Komplementer

**`EducationLevel`** (referensi, opsional tapi direkomendasikan) — mengunci tingkat + urutan.
```
code   String @id   // X | XI | XII
order  Int          // 1 | 2 | 3
label  String       // "Kelas X", dst.
```
`Class.educationLevel` → FK ke tabel ini. Menggantikan string bebas; menjadi dasar validasi promosi (X→XI→XII) dan UI (dropdown).

**`PromotionRun`** (audit, opsional) — jejak operasi promosi massal.
```
id            String  @id
fromYearId    String
toYearId      String
runBy         String?
status        String  // SUCCESS | PARTIAL | FAILED
summary       String? // {"moved": 120, "repeated": 2, "graduated": 40, "noTarget": 3}
createdAt     DateTime
```

### Tidak perlu dibuat (sudah cukup)
`AcademicYear`, `Curriculum`, `Class`, `Member`, `Borrow` (snapshot sudah benar). Tidak perlu `ClassCapacity`/`ClassSchedule` untuk fondasi ini.

---

## 4. Relationship Diagram (deskriptif)

```
AcademicYear 1 ── N Class (per-tahun, unique komposit)
Curriculum   1 ── N Class
EducationLevel (ref) 1 ── N Class.educationLevel

Member       1 ── N MemberEnrollment ── N ── 1 Class
Member       1 ── 1 Class  (denormalisasi "kelas sekarang", opsional setelah enrollment hadir)

Member       1 ── N Borrow  (Borrow menyimpan snapshot memberName/memberNumber/className)
Class       1 ── N Borrow   (via className snapshot / member — tidak ada FK langsung)

MemberEnrollment.academicYearId → AcademicYear.id
MemberEnrollment.classId      → Class.id
PromotionRun.fromYearId/toYearId → AcademicYear.id
```

Alur data kunci:
- **Sumber kebenaran histori** = `MemberEnrollment`.
- **Pointer cepat "kelas sekarang"** = `Member.classId` (denormalisasi untuk daftar anggota & peminjaman; harus sinkron dengan enrollment aktif).
- **Snapshot dokumen/cetak** = string di `Borrow` (sudah ada) → cetak kuitansi tidak pernah terpengaruh rename kelas.

---

## 5. Promotion Flow

Fase tahun ajaran (diawali "Tutup Tahun" + "Buka Tahun Baru"):

1. **Siapkan tahun baru:** buat `AcademicYear` baru; **clone struktur kelas** dari tahun lama ke tahun baru (X→XI, XI→XII; `EducationLevel.order+1`), parallel dipertahankan atau diubah (rename = row baru di tahun baru, bukan update row lama).
2. **Promosi kelas** (PromotionService, 1 transaksi):
   - Ambil semua `MemberEnrollment` ACTIVE di tahun lama + kelas sumber.
   - `PromotionRun` mencatat run.
   - Per anggota:
     - **Naik (X→XI, XI→XII):** tutup enrollment lama (`leftReason=PROMOTED`, `leftAt`); buat enrollment baru (`status=ACTIVE`) di kelas target tahun baru; update `Member.classId`.
     - **Tinggal kelas (X→X):** enrollment baru di tingkat SAMA tahun baru; `leftReason=REPEATED`.
     - **XII → lulus:** tutup enrollment `status=GRADUATED`; `Member.status → GRADUATED` (tetap tersimpan, riwayat pinjam utuh).
     - **Tidak ada kelas target:** jangan pindahkan; tandai `noTarget` untuk ditangani manual (tidak pernah drop diam-diam).
   - Satu `$transaction`: sebagian gagal → rollback penuh (konsisten dengan `MemberImportService.writePhase`).
3. **Aktifkan tahun baru / nonaktifkan tahun lama** (satu operasi, pastikan selalu tepat satu `isActive`).
4. **Hasil:** seluruh histori tersimpan; operasi bisa diulang di tahun berikutnya.

**Pembagian ulang kelas (36→18+18):** bukan promosi tingkat, tapi **redistribusi** — tutup enrollment sumber (`leftReason=REDISTRIBUTED`), buat enrollment baru per siswa ke 2+ kelas target dengan daftar eksplisit (atau split otomatis by count). Tetap lewat enrollment → histori utuh.

---

## 6. Academic History Strategy

Prinsip tiga lapis (defense-in-depth):

1. **Immutable history — `MemberEnrollment`:** setiap penempatan = 1 row. Tidak pernah update in-place; selalu close-and-open. "X IPA 1 (2024/25)" tetap bernama begitu selamanya karena merujuk row `Class` tahun itu.
2. **Per-tahun entity (sudah ada):** `Class` per `AcademicYear` → rename kurikulum ("X IPA 1" → "X Merdeka 1") terjadi sebagai row baru di tahun baru; row lama tidak disentuh.
3. **Snapshot operasional (sudah ada di Borrow):** kuitansi/laporan selalu membaca snapshot, bukan pointer live. Perluas pola ini ke cetak/report lain.

Dengan strategi ini pergantian tahun ajaran **tidak pernah menghapus** apa pun — hanya menutup enrollment lama dan membuka baru.

---

## 7. Import Integration Strategy

Perbaikan integrasi `MemberImportService` dengan master data:

1. **Target eksplisit:** dialog impor meminta **Tahun Ajaran + Kurikulum** (default: tahun aktif). `MemberClassResolver.resolve(rows, academicYearId)` menarget tahun tersebut — bukan tahun aktif implisit.
2. **Resolusi kelas** tetap `(educationLevel, parallel)` → `classId`; `classNotFound`/`classAmbiguous` tetap BLOCKER (keputusan PO #5).
3. **Write phase menulis enrollment:** di dalam `$transaction` yang sama, selain `Member` juga buat `MemberEnrollment` (status ACTIVE) per baris; `Member.classId` = pointer sinkron.
4. **Aturan duplikat ulang-tahun:** NISN tetap unique global (identitas), tetapi keberadaan enrollment di tahun target menentukan "sudah ditempatkan tahun ini?" — siswa yang sudah ada di DB tetapi belum punya enrollment di tahun target → **tambah enrollment**, bukan blokir. Ini syarat agar import tahunan berulang berjalan.
5. **Preflight** menampilkan kelas yang tersedia di tahun target sehingga pengguna tahu format nama yang cocok.

---

## 8. Risk Analysis

| Risiko | Prob. | Dampak | Mitigasi |
|--------|-------|--------|----------|
| Rename kelas mengubah label histori | Tinggi | Tinggi | `MemberEnrollment` + `Class` per-tahun; snapshot di `Borrow` |
| Promosi massal salah target (X→XII) | Sedang | Tinggi | `EducationLevel.order`; validasi tingkat+1; `PromotionRun` audit |
| Kehilangan jejak siswa lulus/pindah/keluar | Tinggi | Tinggi | Enrollment `status`/`leftReason`; `Member.status` diperluas |
| Impor salah tahun (aktif implisit) | Sedang | Sedang | Target tahun eksplisit di dialog impor |
| Duplikat NISN antar-tahun memblokir naik kelas | Sedang | Sedang | Pisahkan aturan identitas vs. penempatan per-tahun |
| Dua tahun `isActive` sekaligus | Sedang | Sedang | Guard aktivasi eksklusif (1 aktif) di service |
| `educationLevel` tak dikenal | Rendah | Rendah | FK/referensi `EducationLevel` |
| Delete member dengan riwayat | — | — | Sudah diblokir (`countBorrows`); jangan pernah hard-delete anggota alumni |

---

## 9. Production Readiness Assessment

| Dimensi | Kesiapan |
|---------|----------|
| Model data master (Year/Curriculum/Class) | ✅ Layak, sudah per-tahun |
| Backend service/repo/IPC/preload/DTO | ✅ Lengkap & terdaftar |
| Histori akademik anggota | ❌ Tidak ada (`MemberEnrollment` belum ada) |
| Lifecycle (lulus/pindah/keluar/tinggal) | ❌ Tidak ada status/entitas |
| Promosi & rollover tahun ajaran | ❌ Tidak ada engine/workflow |
| UI Master Data Akademik | ❌ Tidak ada (Sidebar hanya master buku) |
| Reporting | ❌ Placeholder |
| Import anggota ↔ master data | ⚠️ Bisa, tapi kaku (tahun aktif + blokir duplikat antar-tahun) |
| Histori peminjaman saat rename kelas | ✅ Snapshot `className` di `Borrow` |

Kesimpulan: **fondasi (model + backend) sehat**, tetapi modul belum lengkap sebagai fondasi seluruh sistem perpustakaan karena hilangnya entitas histori, tidak ada lifecycle, tidak ada UI, dan tidak ada reporting.

---

## 10. Recommendation

1. **Segera (blocker untuk produksi):**
   - Tambah entitas `MemberEnrollment` (+ relasi ke Member/Class/AcademicYear) sebagai sumber histori; pertahankan `Member.classId` sebagai pointer sinkron.
   - Tambah UI Master Data Tahun Ajaran/Kurikulum/Kelas (API sudah siap di preload) — tanpa ini master data tidak bisa diisi dari aplikasi.
   - Tambah referensi `EducationLevel` (X/XI/XII + order) untuk validasi & promosi.
2. **Fase 2:** `PromotionService` (promosi + redistribusi + tinggal kelas) dengan `PromotionRun` audit; flow "Tutup/Buka Tahun Ajaran" dengan guard 1-aktif.
3. **Fase 3:** Perluas `Member.status` (GRADUATED/TRANSFERRED/DROPPED) + integrasi impor (target tahun/kurikulum, duplikat per-tahun, tulis enrollment).
4. **Fase 4:** Reporting (anggota per kelas, peminjaman per kelas, statistik per tahun) memakai enrollment + snapshot.

Urutan ini menjaga kompatibilitas: seluruh perubahan bersifat **additif** (tidak memecah `Borrow`/`Member`/`Class` yang sudah dipakai produksi).

---

## Status: **NOT READY**

**Alasan:** Desain backend (AcademicYear/Curriculum/Class per-tahun + snapshot `Borrow`) adalah fondasi yang benar, tetapi modul tidak lengkap untuk produksi: (1) tidak ada entitas histori penempatan anggota (`MemberEnrollment`) sehingga promosi/kenaikan/redistribusi/lulus/pindah tidak bisa direpresentasikan tanpa kehilangan riwayat; (2) tidak ada UI untuk mengisi master data — kondisi saat ini membuat impor anggota gagal karena database kelas kosong dan tidak ada cara mengisinya lewat aplikasi; (3) tidak ada lifecycle status dan tidak ada reporting. Modul siap **setelah** entitas histori + UI master data ditambahkan.
