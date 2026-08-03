# MASTER DATA AKADEMIK — ARCHITECTURE RFC (REVISION 1)

**Peran:** Principal Software Architect
**Mode:** DESIGN ONLY — tidak ada perubahan kode, tidak ada migration, tidak ada implementasi, tidak ada commit.
**Source of Truth:** `MASTER_DATA_AKADEMIK_AUDIT.md` (APPROVED)
**Status revisi:** REVISION 1 — menanggapi REVISION REQUIRED dari PO.
**Keputusan PO yang wajib diikuti:** (1) MemberEnrollment = SSOT histori; (2) jangan pakai `Member.classId` sebagai pointer aktif; (3) Class per tahun ajaran, rename tidak menyentuh tahun lama; (4) Promotion Engine 3 mode; (5) Import berorientasi Enrollment; (6) status akademik dipisah dari status sistem.

**Status:** **APPROVED** (rekomendasi untuk persetujuan — lihat bagian 19).

---

## 1. Domain Model

### 1.1 Bounded Context
| Context | Aggregate | Tanggung jawab |
|---------|-----------|----------------|
| **Akademik** | AcademicYear, Curriculum, Class, MemberEnrollment, PromotionRun, EducationLevel | Penempatan anggota di kelas per tahun; riwayat akademik; promosi/redistribusi; mutasi |
| **Keanggotaan** | Member (identity + tipe + status sistem) | Identitas anggota; tipe keanggotaan; status sistem (boleh pinjam atau tidak) |
| **Operasional** | Borrow, BorrowDetail, BookCopy, AssetEvent | Peminjaman; snapshot `memberName/memberNumber/className` untuk kuitansi |

**Prinsip inti:** context operasional TIDAK pernah membaca penempatan historis — ia membaca **snapshot** (`Borrow.className`) dan **penempatan aktif** (via Service).

### 1.2 Aggregate MemberEnrollment (Aggregate Root)
`MemberEnrollment` adalah aggregate root context akademik. Seluruh transisi penempatan (enroll, promosi, redistribusi, lulus, pindah, keluar, tinggal kelas) melewati aggregate ini.

### 1.3 Keputusan teknis — `Member.classId` (PO #2)
**Verdict: TIDAK diperlukan.** Konsumen `member.class` saat ini (`member.service.ts`, `borrow.service.ts:170`, guard hapus kelas, UI `classInfo`) semuanya dapat dihitung dari **enrollment aktif** (`status=ACTIVE` AND `leftAt IS NULL`). **Keputusan: hapus `Member.classId` setelah fase migrasi (§15); kelas sekarang SELALU dihitung dari enrollment aktif.** Alternatif (proyeksi cache) di §18.

---

## 2. Entity

### 2.1 `MemberEnrollment` (BARU — aggregate root akademik)
```
model MemberEnrollment {
  id             String   @id @default(uuid())
  memberId       String
  classId        String
  academicYearId String
  status         String   // ACTIVE | PROMOTED | REPEATED | REDISTRIBUTED
                          // | TRANSFERRED | DROPPED | GRADUATED
  enrolledAt     DateTime @default(now())
  leftAt         DateTime?
  note           String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  member       Member       @relation(...)
  class        Class        @relation(...)
  academicYear AcademicYear @relation(...)

  @@index([memberId, academicYearId])
  @@index([memberId, status])
  @@index([classId])
  @@index([academicYearId])
  @@index([status])
}
```
**Catatan desain:** TIDAK ada `@@unique([memberId, academicYearId])` — pembagian ulang **tengah tahun** menghasilkan 2 baris (kelas A → B) dan keduanya tercatat. Yang dipaksa unik adalah **"satu enrollment AKTIF per anggota"**, dijaga di service layer (SQLite tidak mendukung partial unique).

### 2.2 `PromotionRun` + `PromotionRunItem` (BARU — audit operasi massal)
```
model PromotionRun {
  id         String @id
  fromYearId String
  toYearId   String
  mode       String // AUTOMATIC | MAPPING | BULK_EDIT
  runBy      String?
  status     String // SUCCESS | PARTIAL | FAILED
  summary    String? // JSON {"promoted":120,"repeated":2,"graduated":40,"noTarget":3,"errors":1}
  startedAt  DateTime @default(now())
  finishedAt DateTime?
}

model PromotionRunItem {
  id             String @id
  promotionRunId String
  memberId       String
  sourceClassId  String
  targetClassId  String? // null = NO_TARGET / ERROR
  outcome        String  // PROMOTED | REPEATED | REDISTRIBUTED | GRADUATED | NO_TARGET | ERROR
  message        String?
}
```
`PromotionRun` juga menjadi **wadah audit untuk seluruh operasi massal** (tidak terbatas promosi) — lihat §10 Bulk Operation Engine.

### 2.3 `EducationLevel`
**Keputusan final: konstanta terpusat** (shared config), BUKAN tabel referensi (SQLite tanpa enum; tingkat SMA tetap X/XI/XII; tanpa kebutuhan admin menambah tingkat; tanpa join/migrasi):
```
// src/shared/config/education-level.ts (BARU, tidak diimplementasikan sekarang)
export const EDUCATION_LEVELS = { X: 1, XI: 2, XII: 3 } as const
export function levelOrder(level: string): number { ... }
```
Alternatif tabel referensi: §18.

### 2.4 Perubahan entity lama
| Entity | Perubahan |
|--------|-----------|
| `Member` | `classId` dihapus setelah fase 3 (§15); `status` sistem tetap `ACTIVE\|INACTIVE`; `memberType` dipersempit menjadi domain `MemberType` (§5) |
| `Class` | `educationLevel` + `parallel` **immutable** setelah dibuat |
| `AcademicYear` | Guard 1-aktif; `isActive` diubah hanya lewat operasi "Buka/Tutup Tahun" |
| `Borrow` | **Tidak berubah**; sumber snapshot dipindah ke enrollment aktif |

---

## 3. Relationship

```
AcademicYear  1──N Class                  (per-tahun, unique komposit)
Curriculum    1──N Class
EducationLevel (konstanta, bukan tabel)

Member        1──N MemberEnrollment N──1 Class
Member        1──N MemberEnrollment N──1 AcademicYear
Member        1──N Borrow            (snapshot memberName/memberNumber/className)

PromotionRun  1──N PromotionRunItem N──1 Member
PromotionRun  ── fromYearId/toYearId ──> AcademicYear

MemberEnrollment  (sumber "kelas sekarang" — via join aktif)
Borrow            (snapshot className string — TIDAK ada FK ke Class)
```
**Akses "kelas sekarang":** `WHERE memberId=? AND status='ACTIVE' AND leftAt IS NULL` → `Class` → label. Didukung `@@index([memberId, status])`.

---

## 4. Konsep Tiga Status (REVISION #1)

Tiga konsep yang **berbeda peran dan tidak boleh dicampur**:

| Dimensi | **Member Type** | **Member Status** | **Academic Status** |
|---------|-----------------|-------------------|---------------------|
| Menjawab | "Siapa dia?" | "Boleh pinjam?" | "Bagaimana posisi akademiknya?" |
| Milik | identity (diri anggota) | keanggotaan perpustakaan | penempatan di kelas/tahun |
| Nilai | `STUDENT` \| `TEACHER` \| `GENERAL` | `ACTIVE` \| `INACTIVE` | `ACTIVE` \| `PROMOTED` \| `REPEATED` \| `REDISTRIBUTED` \| `TRANSFERRED` \| `DROPPED` \| `GRADUATED` |
| Lokasi simpan | `Member.memberType` (domain key) | `Member.status` | `MemberEnrollment.status` |
| Frekuensi ubah | praktis sekali (identity) | jarang (lifecycle) | per tahun/per mutasi |
| Berlaku untuk | semua anggota | semua anggota | **hanya STUDENT** (Guru/Umum tidak punya enrollment) |
| Konsumen | nomor anggota (prefix S/G/U), hak pinjam, filter daftar, import | gate `BorrowService` (`status !== 'ACTIVE'` → tolak) | promosi, histori, laporan demografi, import |
| Sumber kebenaran | domain config (§5) | derivasi lifecycle | `MemberEnrollment` (SSOT) |

**Tanggung jawab masing-masing:**
- **Member Type** → menentukan **aturan/otoritas**: prefix nomor anggota, jumlah buku yang boleh dipinjam (hak), dan apakah anggota punya rekam akademik. Bersifat **immutable** (identitas).
- **Member Status** → menentukan **gate operasional**: kendali boleh/tidak meminjam. Nilai terminal akademik (lulus/pindah/keluar) **men-drive** transisi ini, tetapi **tidak menyimpan** arti akademiknya.
- **Academic Status** → menentukan **riwayat akademik**: hasil penempatan per tahun; bahan promosi, mutasi, dan laporan.

**Aturan sinkronisasi (service layer):** `GRADUATED`/`TRANSFERRED`/`DROPPED` → sistem `INACTIVE`; `PROMOTED`/`REPEATED`/`REDISTRIBUTED` → sistem tetap `ACTIVE`. Tidak ada duplikasi data — `Member.status` adalah hasil derivasi, `MemberEnrollment.status` adalah fakta.

---

## 5. Domain `MemberType` (REVISION #2 — konsep, bukan implementasi)

**Kondisi saat ini (fakta kode):** `memberType` adalah string bebas (`'student' | 'teacher' | 'general'`) yang tersebar di: `labels.ts` (`MEMBER_TYPES`), `MemberForm.tsx` (`MEMBER_TYPES`), `number-generator.service.ts` (`MEMBER_TYPE_PREFIX`), `labels.ts` (`MEMBER_RIGHTS`), route `members/students|teachers|general`, dan `member-import` hardcode `'student'`. **Tidak ada definisi tunggal.**

**Konsep domain yang diajukan (belum diimplementasikan):**
```
MemberType :: STUDENT | TEACHER | GENERAL
  code: string                    // 'student' | 'teacher' | 'general'
  label: string                   // 'Siswa' | 'Guru' | 'Umum'
  memberNumberPrefix: string      // 'S' | 'G' | 'U'
  borrowRights: { maxBooks, canBorrow }
  hasAcademicRecord: boolean      // true hanya untuk STUDENT
```
- **Sifat:** value object / enumerasi domain dalam **shared config** (satu sumber), bukan tabel DB (nilainya tetap). 
- **Tanggung jawab:** menjadi satu-satunya definisi yang dipakai UI label, number generator, hak pinjam, filter daftar, import, dan logika enrollment ("apakah anggota ini perlu enrollment?").
- **Dampak:** menghapus literal tersebar; `memberType: 'student'` di import menjadi `MemberType.STUDENT`; validasi tipe di create/update.
- **Alternatif:** kolom tetap string + validasi terpusat di service saja (lebih ringan, tanpa enum). **Catatan:** keputusan mana yang diambil (enum vs tabel vs string+validasi) adalah keputusan desain detail, ditentukan saat penyusunan Work Order — RFC hanya memastikan **konsep domain `MemberType` diakui** sebagai satu sumber kebenaran.

---

## 6. Academic Lifecycle

### 6.1 Status Akademik (`MemberEnrollment.status`)
| Nilai | Arti | leftAt | Transisi berikutnya |
|-------|------|--------|---------------------|
| `ACTIVE` | Terpasang sekarang | null | → PROMOTED / REPEATED / REDISTRIBUTED / TRANSFERRED / DROPPED / GRADUATED |
| `PROMOTED` | Naik tingkat (X→XI, XI→XII) | set | terminal tahun itu |
| `REPEATED` | Tinggal kelas (X→X) | set | terminal tahun itu |
| `REDISTRIBUTED` | Pembagian ulang (1→N, N→1, tengah tahun) | set | terminal tahun itu |
| `TRANSFERRED` | Pindah sekolah | set | terminal tahun itu |
| `DROPPED` | Keluar sekolah | set | terminal tahun itu |
| `GRADUATED` | Lulus (tamat XII) | set | terminal tahun itu |

### 6.2 Alur penutupan & pembukaan
- `close(enrollmentId, status, note)` — hanya berlaku untuk `ACTIVE`; set `status` terminal + `leftAt`. Tidak pernah `DELETE`.
- `enroll(memberId, classId, academicYearId)` — validasi: member ada, class ada & milik tahun itu, **tidak ada enrollment ACTIVE lain** (tutup dulu bila ada / blokir).

---

## 7. Promotion Flow (PO #4 — tiga mode)

Prasyarat: tahun baru dibuat, tepat satu `isActive`, `EducationLevel` terdefinisi.

### Mode A — Automatic
Input `fromYearId`, `toYearId`, `fromClassId` (atau semua). Siswa ACTIVE dipromosikan ke `levelOrder+1`; parallel dicocokkan otomatis (`X MERDEKA 1` → `XI MERDEKA 1`); `XII` → `GRADUATED`. Tanpa target → `NO_TARGET`, tidak dipindahkan, ditangani manual. Validasi: tidak ada yang dipromosikan ke tingkat sama (kecuali dinyatakan REPEATED).

### Mode B — Mapping
Daftar eksplisit `sourceClassId → [target1, target2, ...]` (1→N redistribusi, N→1 merge, 1→1 termasuk tinggal kelas). Untuk 1→N: split otomatis rata ATAU daftar siswa eksplisit per target. Target divalidasi di tahun baru & tingkat valid.

### Mode C — Bulk Edit
Batch `(memberId, targetClassId)` atau "semua anggota kelas X → Y". Tanpa aturan tingkat; tetap **menulis enrollment** agar histori utuh.

### 7.1 Alur bersama
1. **Preview** (lihat §8) → operator melihat ringkasan.
2. Buat `PromotionRun` (RUNNING) → setiap operasi menulis `PromotionRunItem`.
3. SATU `$transaction`: tutup enrollment lama, buat enrollment baru, sesuaikan `Member.status` bila terminal.
4. `PromotionRun.status = SUCCESS | PARTIAL | FAILED`. AUTOMATIC = all-or-nothing per run; MAPPING/BULK boleh PARTIAL (per-item) — dan **retry** memakai strategi §9.
5. `summary` + item tersimpan → bisa direview dan diulang.

---

## 8. Promotion Preview (REVISION #5)

**Sebelum execute, operator WAJIB melihat pratinjau** — komponen `PromotionPreviewService` (read-only, tanpa tulis):

```
PromotionPreviewDTO {
  mode: 'AUTOMATIC' | 'MAPPING' | 'BULK_EDIT'
  counts: {
    promoted:    number   // jumlah naik kelas
    repeated:    number   // jumlah tinggal kelas
    graduated:   number   // jumlah lulus (XII)
    redistributed: number // jumlah pembagian ulang
    noTarget:    number   // tanpa kelas target
    error:       number   // validasi/data error
  }
  items: Array<{ memberId, memberName, sourceClassId, sourceLabel,
                 targetClassId|null, targetLabel|null, outcome }>
}
```
- **Cara hitung:** dry-run dengan **fungsi keputusan yang sama** dengan execute (`decide(item) → outcome+target`). Karena aturan deterministik terhadap state saat ini, hasil preview == hasil execute — kecuali ada perubahan data di antara keduanya.
- **Jaga konsistensi:** di dalam `$transaction` execute, fungsi keputusan **dijalankan ulang** (re-validate); jika state berubah (mis. enrollment sudah ditutup pihak lain), item menjadi `ERROR`/di-skip — tidak pernah mengeksekusi keputusan basi.
- **UX:** tampilkan 5 angka ringkasan + daftar item yang bisa diekspansi (khusus `noTarget`/`error`); tombol Execute aktif hanya setelah preview berhasil. Preview tidak menyimpan state.

---

## 9. PromotionRun — Retry Strategy (REVISION #3)

**Masalah:** run ulang tidak boleh memproses ulang seluruh siswa (duplikat, membuang waktu, risiko salah).

**Strategi — "retry = proses yang masih memenuhi syarat" (state-based idempotency):**

1. **Eligibilitas berbasis state, bukan berbasis run.** Siswa hanya diproses bila **enrollment sumber masih `ACTIVE`**. Setelah berhasil dipromosikan, enrollment sumber ditutup (`PROMOTED`) → otomatis **tidak eligible** di run berikutnya.
2. **Retry alami bertahap.** Siswa yang run sebelumnya berstatus `NO_TARGET` / `ERROR` **tetap ACTIVE** → satu-satunya yang diproses saat run ulang (setelah target dibuat/diperbaiki). Run ke-2 = delta, bukan full re-run.
3. **Idempoten tanpa key khusus.** Tidak perlu flag `processed`/dedup key: kondisi `source.status='ACTIVE'` sudah menjamin idempotency. Run ulang yang sama persis menghasilkan `promoted:0` (semua sudah ditutup).
4. **Pembatasan manual (MAPPING/BULK):** operator boleh menunjuk subset; engine tetap memfilter "enrollment sumber ACTIVE" — item yang sudah diproses dilaporkan `SKIPPED_ALREADY_PROCESSED` (count terpisah di `summary`).
5. **Single-flight.** Satu run berjalan pada satu waktu (pola `importRunning` di `MemberImportService`) — mencegah dua run balapan menulis enrollment.
6. **Re-validation dalam transaksi.** Fungsi keputusan dijalankan ulang saat execute; state yang berubah → item `ERROR` atau `SKIPPED`, dilaporkan, bukan dieksekusi.
7. **Forward-only.** Tidak ada "undo/revert" otomatis. Koreksi kesalahan = operasi baru (mis. `REDISTRIBUTED`), bukan membalik run lama — menjaga jejak audit linear.

**Dampak jangka panjang:** retry selalu aman dan murah; operator bebas mencoba promosi kapan saja setelah memperbaiki master data (menambah kelas target) tanpa takut memproses ulang siswa yang sudah benar.

---

## 10. Bulk Operation Engine (REVISION #4)

**Bulk Edit diperluas menjadi `BulkOperationEngine`** — mesin eksekusi umum untuk SEMUA mutasi akademik massal, bukan hanya promosi.

### 10.1 Konsep
```
BulkOperationEngine.execute(operation, selection, targetResolver, mode) 
  1. PREVIEW  -> hitung outcome (dry-run, fungsi keputusan sama dengan execute)
  2. EXECUTE  -> 1 $transaction: tutup+buka enrollment, update Member.status,
                 tulis PromotionRun + PromotionRunItem
  3. REPORT   -> summary per outcome + daftar error/noTarget
```

### 10.2 Parameter (konfigurasi, bukan kode per-jenis)
| Parameter | Nilai | Contoh |
|-----------|-------|--------|
| `operation` | jenis mutasi | `PROMOTE` \| `REASSIGN` \| `REPEAT` \| `GRADUATE` \| `TRANSFER` \| `DROP` \| `REDISTRIBUTE` |
| `selection` | populasi sasaran | "semua ACTIVE kelas X tahun Y" / daftar memberId / filter memberType=STUDENT |
| `targetResolver` | cara menentukan target | `AUTOMATIC` (level+1, cocok parallel) / `MAPPING` (tabel source→target) / `PER_ITEM` (bulk edit eksplisit) |
| `mode` | granularity transaksi | `ALL_OR_NOTHING` / `PARTIAL_PER_ITEM` |

### 10.3 Hubungan dengan 3 mode promosi (PO #4)
Ketiga mode promosi = **instansiasi spesifik engine**:
- Automatic → operation=PROMOTE, resolver=AUTOMATIC, ALL_OR_NOTHING.
- Mapping → resolver=MAPPING (termasuk 1→N redistribusi, merge, tinggal kelas), PARTIAL_PER_ITEM.
- Bulk Edit → resolver=PER_ITEM, PARTIAL_PER_ITEM.
- Preview (§8) & Retry (§9) menjadi **fitur bawaan engine** untuk semua operation.

### 10.4 Alasan & kelebihan
- **Satu jalur tulis** untuk semua mutasi → aturan domain (immutability Class, satu-ACTIVE, transaksi, audit) diimplementasikan sekali, tidak bocor per-feature.
- **Audit seragam** lewat `PromotionRun` (berganti nama menjadi `BulkOperationRun` bila diadopsi — detail nama diputuskan di Work Order).
- **Extensible:** operasi baru (mis. "pindahkan semua alumni ke grup alumni") cukup konfigurasi, tanpa entity baru.
### 10.5 Kekurangan / risiko
- Engine lebih abstrak → butuh desain kontrak yang matang agar tidak jadi "kotak ajaib".
- Over-engineering bila kebutuhan hanya promosi tahunan — mitigasi: mulai dari 3 operation inti (PROMOTE, REASSIGN, CLOSE) lalu perluas.
**Verdict:** diadopsi sebagai desain.

---

## 11. Enrollment Flow

- **Enroll:** `enroll(memberId, classId, academicYearId)` — validasi member/class/tahun + satu-ACTIVE; buat `status=ACTIVE`.
- **Close:** `close(enrollmentId, status, note)` — hanya untuk `ACTIVE`; set terminal + `leftAt`. Tidak pernah DELETE.
- **Repoint (mutasi tengah tahun):** `close(...REDISTRIBUTED)` lalu `enroll(...)` — dua baris, histori utuh.
- **Konsumsi "kelas sekarang":** `findActiveByMember(memberId)` → dipakai `MemberService.classInfo`, `BorrowService.create` (snapshot), guard hapus kelas.

---

## 12. Member Import Flow (PO #5)

### 12.1 Alur inti
1. Dialog memilih `academicYearId` + `curriculumId` (default tahun aktif).
2. Identitas: cek NISN/NIK/email → temukan `Member` (identitas global unique).
3. Duplikat = "sudah ada enrollment ACTIVE di tahun target".
   - Member baru → buat `Member` + `MemberEnrollment(ACTIVE)` dalam satu transaksi.
   - Member ada & belum ada enrollment tahun target → **hanya buat `MemberEnrollment`** (PO #5; impor tahunan berulang dimungkinkan).
4. Resolusi kelas: `MemberClassResolver.resolve(rows, academicYearId, curriculumId)` — skop tahun eksplisit; `classNotFound`/`classAmbiguous` tetap BLOCKER.
5. Write phase: SATU `$transaction` — `createMany(Member)` + `createMany(MemberEnrollment)` + `Member.status` default `INACTIVE`. `Member.classId` tidak lagi ditulis.
6. Preflight menampilkan kelas tersedia di tahun target.

### 12.2 Strategi saat Member SUDAH punya Enrollment ACTIVE di tahun yang sama (REVISION #6 — perbandingan, TANPA pilihan)

Situasi: baris impor menunjuk siswa yang enrollment ACTIVE tahun target sudah ada (impor ulang / koreksi kelas / file duplikat). Alternatif yang dipertimbangkan:

| # | Strategi | Cara kerja | Kelebihan | Kekurangan |
|---|----------|-----------|-----------|------------|
| **A** | **Skip & flag** | Baris diabaikan; dilaporkan "sudah terdaftar" di ringkasan | Aman; non-destruktif; tanpa ambiguitas | Operator tak bisa memperbaiki kelas salah lewat impor; harus edit manual |
| **B** | **Overwrite / repoint** | Tutup enrollment lama (`REDISTRIBUTED`) → buat baru dari baris impor | Impor jadi "bulk replacer" andal; memperbaiki kelas salah cepat | Destruktif; bisa mengubah penempatan tanpa sadar; butuh konfirmasi eksplisit; risiko bila file basi |
| **C** | **Block & error** (perilaku duplikat sekarang) | Baris dianggap duplikat → error | Paling ketat; tanpa kejutan | Memblokir impor tahunan berulang; impor lintas tahun tidak mungkin tanpa mode lain |
| **D** | **Merge + banding** | Bandingkan kelas impor vs enrollment aktif: sama → no-op; beda → operator memutuskan (keep/overwrite) per konflik | Presisi; kejutan minimal | UI lebih kompleks; banyak keputusan per-baris |
| **E** | **Append saja** (2 enrollment dalam setahun) | Tambah enrollment kedua tahun yang sama | Historis lengkap | Melanggar aturan "satu ACTIVE"; ambigu "kelas sekarang" — **tidak layak** |

**Catatan:** pilihan strategi berinteraksi dengan Retry (§9) dan idempotensi impor. Tidak ada keputusan diambil di RFC ini — pemilihan (mungkin berparameter per mode impor: "initial load" vs "update placement") diputuskan PO sebelum Work Order.

---

## 13. Class Rename Strategy (PO #3)

- **Aturan:** `educationLevel` + `parallel` **immutable** setelah `Class` dibuat.
- **Rename di batas tahun:** buat `Class` baru di tahun baru dengan nama baru; enrollment tahun lama tetap merujuk row lama → label historis tidak berubah.
- **Rename tengah tahun:** kelas baru + `REDISTRIBUTED` (close→enroll) — histori menyimpan kedua label.
- **Mengapa bukan update in-place:** row `Class` dirujuk `MemberEnrollment` dan (via snapshot) `Borrow`; mengubah `parallel` memalsukan label histori.
- Snapshot `Borrow.className` & laporan selalu membaca enrollment/snapshot → kuitansi lama aman.

---

## 14. Reporting Impact

- `ReportsPage` placeholder — RFC **tidak menambah entity report**; laporan dibangun dari:
  - **Anggota per kelas per tahun** → `MemberEnrollment` join `Class` join `AcademicYear`.
  - **Peminjaman per kelas** → snapshot `Borrow.className` (historis) / enrollment aktif (periode berjalan).
  - **Statistik mutasi** → `PromotionRunItem.outcome` (promoted/repeated/graduated/transferred/dropped).
  - **Rekap tahunan** → `AcademicYear.isActive` + enrollment.
- Snapshot `Borrow` = sumber kebenaran dokumen/kuitansi; enrollment = sumber demografi.

---

## 15. Migration Strategy

**Status data saat ini:** DB live 0 `Member`, 0 `Class`, 0 `AcademicYear` — backfill praktis no-op, desain tetap generik.

| Fase | Tindakan | Breaking? |
|------|----------|-----------|
| **F1 (additive)** | Buat `MemberEnrollment`, `PromotionRun`, `PromotionRunItem`. Backfill: setiap `Member` dengan `classId!=null` → `MemberEnrollment(ACTIVE)` memakai `class.academicYearId`. `Member.classId` tetap ada. | Tidak |
| **F2 (cutover reads)** | Service membaca "kelas sekarang" dari enrollment aktif (MemberService, BorrowService, guard hapus kelas, resolver import). `Member.classId` berhenti ditulis. UI `classInfo` tetap shape-nya. | Tidak |
| **F3 (removal)** | Hapus kolom `Member.classId` + konsumen legacy. `env.d.ts`/DTO dirapikan. | Ya (setelah F2 stabil) |

Verifikasi tiap fase: `migrate deploy` fresh PASS, `migrate status` hijau, smoke enroll→promote→repeated→graduated pada DB uji.

---

## 16. Backward Compatibility

| Konsumen | Kondisi sekarang | Setelah F2 | Aksi |
|----------|------------------|------------|------|
| `MemberDTO.classInfo` (UI) | dari `member.class` | dari enrollment aktif (shape SAMA) | Tanpa perubahan UI |
| `BorrowService.create` (snapshot) | baca `member.class` | baca enrollment aktif (1 query) | Internal |
| `ClassService.delete` (guard) | `member.count({classId})` | `enrollment.count({classId})` | Internal |
| `MemberImportService` | tulis `classId` | tulis enrollment | Payload sama |
| `MemberService.create/update` `classId` | set langsung | DEPRECATED → arahkan ke `EnrollmentService` | Endpoint `enrollments:*`/`bulkOps:*` baru; lama dihapus di F3 |
| IPC/preload/env.d.ts | — | tambah `enrollments:*`, `bulkOps:*` | Additif |
| `Borrow` snapshot | — | **tidak berubah** | Tanpa migrasi |

---

## 17. Risk Analysis

| Risiko | Prob. | Dampak | Mitigasi |
|--------|-------|--------|----------|
| Dua enrollment ACTIVE per anggota | Sedang | Tinggi | Validasi service + `findActiveByMember`; uji negatif |
| Hapus `Member.classId` sebelum cutover | Rendah | Tinggi | F2→F3 bertahap, verifikasi lapangan |
| Retry memproses ulang siswa | Sedang | Sedang | State-based idempotency (§9) |
| Rename tengah tahun cluster class membesar | Sedang | Rendah | Kelas baru + REDISTRIBUTED; audit |
| `NO_TARGET` siswa tak terurus | Sedang | Sedang | Wajib dilaporkan; enrollment lama tetap terbaca sebagai kelas sekarang |
| Impor ulang tahunan dianggap duplikat | Sedang | Sedang | Rule duplikat berbasis enrollment per-tahun (§12.1) |
| Strategi impor §12.2 salah pilih | Sedang | Sedang | Keputusan eksplisit PO sebelum Work Order |
| Report baca data live yang berubah | Sedang | Sedang | Snapshot `Borrow` untuk dokumen; enrollment untuk demografi |

---

## 18. Alternative Design

### A1. Proyeksi cache `Member.currentClassId`
- **Kelebihan:** query "kelas sekarang" tanpa join; UI sederhana.
- **Kekurangan:** dua sumber harus sinkron (cache basi); melanggar semangat PO #2.
- **Verdict:** ditolak sebagai desain utama; dipakai hanya jika F2 terbukti menghambat performa (tidak diperkirakan untuk skala sekolah).

### A2. `EducationLevel` sebagai tabel referensi
- **Kelebihan:** integritas FK; bisa tambah tingkat lain (SMP/MTS) tanpa kode.
- **Kekurangan:** join tiap query; migrasi `Class.educationLevel` → FK.
- **Verdict:** konstanta terpusat dipilih; tabel ref dibuka bila produk mendukung multi-jenjang.

### A3. `@@unique([memberId, academicYearId])` di MemberEnrollment
- **Kelebihan:** jaminan DB "satu kelas per tahun".
- **Kekurangan:** memblokir pembagian ulang tengah tahun; memaksa update-in-place yang kehilangan histori.
- **Verdict:** ditolak — diganti aturan service "satu ACTIVE".

### A4. **AcademicEvent** (REVISION #7)
**Konsep:** event-sourcing-style append-only log per anggota: `AcademicEvent { id, memberId, eventType (ENROLLED|PROMOTED|REPEATED|REDISTRIBUTED|TRANSFERRED|DROPPED|GRADUATED|CLASS_RENAMED|IMPORTED), payload (fromClassId, toClassId, academicYearId), occurredAt, bulkRunId? }`. `MemberEnrollment` menjadi **proyeksi state saat ini** yang dibangun dari event.

**Kelebihan:**
- Jejak audit immutable penuh; rekonstruksi kondisi di titik waktu mana pun.
- Perbaikan kesalahan = event koreksi baru (bukan edit), riwayat linear & transparan.
- Retry/idempotensi natural via replay; dukungan rename historis elegan (`CLASS_RENAMED`).
- Laporan "komposisi kelas per tanggal X" menjadi mudah.

**Kekurangan:**
- Kompleksitas: event store, proyeksi, eventual consistency — manual di Prisma/SQLite tanpa framework event-sourcing.
- Query "kelas sekarang" bergantung proyeksi yang harus selalu dijaga sinkron (dual-write).
- Overkill untuk sistem perpustakaan yang kebutuhan intinya adalah snapshot pinjam + riwayat penempatan sederhana.
- Butuh disiplin tinggi; salah urutan event = histori salah.

**Kapan layak ditambahkan:**
- Saat laporan wajib rekonstruksi point-in-time (komposisi kelas pada tanggal tertentu di masa lalu).
- Saat kepatuhan/audit mengharuskan ledger yang immutable (regulasi, dispute).
- Saat churn mutasi/rename sangat tinggi sehingga proyeksi state biasa sulit dirawat.

**Verdict saat ini:** **tidak diadopsi** — `MemberEnrollment` (state-based dengan status terminal) sudah mencatat riwayat secara linear; snapshot `Borrow` menutupi dokumen. Ditunda; dibuka kembali bila kebutuhan point-in-time muncul.

---

## 19. Final Recommendation

**Setujui RFC revisi dengan prioritas implementasi:**
1. **F1**: `MemberEnrollment` (+ `PromotionRun`/`PromotionRunItem`) + backfill + UI Master Data Tahun Ajaran/Kurikulum/Kelas (blokir produksi saat ini).
2. **F2**: cutover reads (MemberService, BorrowService, import, guard) ke enrollment; API `enrollments:*` + `bulkOps:*`.
3. **Bulk Operation Engine** (dimulai dari PROMOTE/REASSIGN/CLOSE) dengan Preview wajib + Retry state-based.
4. **Import** berorientasi enrollment (target tahun/kurikulum, duplikat per-tahun, tulis enrollment). Strategi §12.2 menunggu keputusan PO.
5. **F3**: hapus `Member.classId` setelah stabil.
6. **Reporting** dibangun di atas enrollment + snapshot.

**Alasan APPROVED:** seluruh 7 poin revisi telah diintegrasikan — (1) tiga status dibedakan tegas dengan tanggung jawabnya (§4); (2) `MemberType` diakui sebagai konsep domain dengan satu sumber definisi (§5); (3) retry promosi berbasis state sehingga run ulang hanya memproses delta (§9); (4) Bulk Edit diperluas menjadi Bulk Operation Engine yang seragam dengan preview+audit (§10); (5) Promotion Preview wajib sebelum execute (§8); (6) strategi impor untuk enrollment aktif di tahun sama dibandingkan tanpa keputusan prematur (§12.2); (7) AcademicEvent didokumentasikan sebagai alternatif dengan kriteria kapan layak (§18.A4). Desain tetap additif di F1–F2, `MemberEnrollment` menjadi satu-satunya sumber kebenaran, dan semua jalur massal melalui engine dengan audit penuh.

**Satu keputusan PO yang tersisa sebelum Work Order:** strategi §12.2 (Skip vs Overwrite vs Block vs Merge). RFC siap menunggu review PO.
