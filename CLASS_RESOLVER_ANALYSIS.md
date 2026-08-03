# CLASS RESOLVER ANALYSIS

**WO:** Audit Read-Only — penyebab "Kelas ... tidak ditemukan." pada Import Anggota
**Status:** READ ONLY — tidak ada perubahan kode, tidak ada commit.

---

## 1. Daftar Kelas di Database

Database aplikasi yang diperiksa: `prisma/aplibrary.db` (DB live — terkonfirmasi berisi
Setting, 2 Buku, 26 Eksemplar, 3 Penulis, 4 Penerbit, 4 Kategori; merupakan satu-satunya
`.db` yang dipakai aplikasi).

| Tabel | Jumlah Record |
|-------|---------------|
| `AcademicYear` | **0** |
| `Curriculum` | **0** |
| `Class` | **0** |
| `Member` | **0** |

**Kelas yang tersimpan di database: KOSONG (tidak ada sama sekali).**
Tidak ada Tahun Ajaran (apalagi yang `isActive=true`), tidak ada Kurikulum, tidak ada Kelas.

---

## 2. Contoh Kelas dari File Excel yang Diimpor

File yang diimpor (isinya data riil SMAN 1 Gondang): `Desktop/Ex Template_Import_Anggota_v1.0.xlsx`
(salinan template dengan data siswa). Kolom `Kelas` berisi 13 nilai unik:

| Tingkat | Parallel (Kurikulum Merdeka) |
|---------|------------------------------|
| X  | MERDEKA 1, MERDEKA 2, MERDEKA 3, MERDEKA 4 |
| XI | MERDEKA 1, MERDEKA 2, MERDEKA 3, MERDEKA 4, MERDEKA 5 |
| XII| MERDEKA 1, MERDEKA 2, MERDEKA 3, MERDEKA 4 |

Contoh baris: `XI MERDEKA 2`, `X MERDEKA 3`, `XII MERDEKA 4`, `XII MERDEKA 1`.
Sumber data lain (`daftar_pd-SMAN 1 GONDANG-2025-12-23.xlsx`, ekspor Dapodik, kolom
"Rombel Saat Ini") memakai format nama yang sama: `X MERDEKA 3`, `XI MERDEKA 2`, `XII MERDEKA 4`, dst.

---

## 3. Hasil Perbandingan

| Aspek | Database | Excel (file impor) |
|-------|----------|--------------------|
| Kelas yang tersedia | **0** | 13 (`X/XI/XII MERDEKA 1–5`) |
| Format penamaan | - (kosong) | `X MERDEKA 1` (huruf besar, spasi tunggal) |
| Tahun Ajaran aktif | **tidak ada** | n/a |

Tidak ada satu pun kelas di Excel yang bisa cocok karena database kelasnya kosong.

---

## 4. Root Cause

**Master data kelas TIDAK ADA di database** (0 `AcademicYear`, 0 `Curriculum`, 0 `Class`).

Alur kegagalan di `MemberClassResolver.resolve()` (`src/main/services/member-class-resolver.service.ts`):

1. `findActive()` mengembalikan `null` (tidak ada Tahun Ajaran yang `isActive=true`)
   → baris 100–104: **setiap baris** langsung dianggap `classNotFound`.
2. Kalaupun ada Tahun Ajaran aktif, `findByAcademicYear()` mengembalikan `[]`
   (tidak ada record `Class`) → baris 106–112: **setiap baris** tetap `classNotFound`.
3. `MemberImportService.runImport` (`member-import.service.ts:100`) melihat
   `preflight.errors.length > 0` → seluruh impor gagal.

Pesan `"Kelas <nama> tidak ditemukan."` berasal dari messageKey
`memberImport.classNotFound` (`labels.ts:340`) yang menyisipkan nama kelas yang dicari
(`className`), mis. `"Kelas XI MERDEKA 2 tidak ditemukan."`.

Resolver **bukan** penyebab: logika normalisasi (uppercase + kolaps spasi) sudah benar,
dan nama kelas di Excel sudah sesuai format yang diharapkan (prefix `X/XI/XII` + parallel).
Tidak ada masalah perbedaan huruf besar/kecil, spasi, maupun format penamaan.

---

## 5. Apakah Ini Bug atau Masalah Data?

**Masalah data (master data kosong), BUKAN bug resolver.**

Namun ada satu **celah produk** yang membuat masalah data ini mustahil diselesaikan oleh
pengguna lewat aplikasi: **tidak ada UI untuk mengelola Tahun Ajaran / Kurikulum / Kelas.**
Menu "Master Data" di Sidebar hanya berisi Penulis, Penerbit, dan Kategori
(`src/components/layout/Sidebar.tsx:33-37`). Padahal API backend-nya sudah lengkap dan siap:
`classes:create`, `academicYears:create`, `curriculums:create` tersedia di preload
(`electron/preload/class.preload.ts`, `academic-year.preload.ts`) dan `env.d.ts`.

Jadi: resolver berjalan benar dan memblokir impor sesuai desain (PO decision: kelas tidak
ditemukan = BLOCKER). Penyebab seluruh baris gagal = kelasnya memang belum ada di database,
dan belum ada cara membuatnya lewat aplikasi.

---

## 6. Rekomendasi Perbaikan

**Prioritas 1 (data) — buat master data dahulu, baru impor:**
- Buat 1 `AcademicYear` dengan `isActive=true` (mis. 2025/2026).
- Buat 1 `Curriculum` (mis. "Kurikulum Merdeka").
- Buat 13 `Class` dengan kombinasi `educationLevel` + `parallel`:
  `X–XII` × `MERDEKA 1..5` sesuai daftar §2.

Setelah itu impor ulang: resolver akan cocok (`X MERDEKA 1` → `educationLevel="X"`,
`parallel="MERDEKA 1"`) tanpa perubahan kode.

**Prioritas 2 (produk) — tambah halaman UI Master Data Tahun Ajaran/Kurikulum/Kelas:**
- Menu "Master Data" diperluas dengan "Tahun Ajaran", "Kurikulum", dan "Kelas"
  memakai API yang sudah ada di preload/`env.d.ts`.
- Tanpa UI ini, pengguna tidak bisa mengisi master data dan fitur impor anggota
  tidak dapat digunakan — ini adalah gap fungsional yang perlu dijadwalkan.

**Prioritas 3 (opsional, UX) — bantu penyelarasan data:**
- Sertakan daftar kelas yang tersedia saat error `classNotFound`, agar pengguna tahu
  kelas mana yang harus dibuat/disesuaikan.
- Pastikan petunjuk template konsisten dengan format `X/XI/XII <parallel>`
  (template sudah memakai contoh `X MIPA 1`; nama di Dapodik/Merdeka adalah `X MERDEKA 1`).

**Tidak perlu:** perubahan pada `MemberClassResolver`, `MemberImportService`, atau parser.

---

## Ringkasan
- Kelas di database: **tidak ada** (0 `AcademicYear`, 0 `Curriculum`, 0 `Class`).
- Kelas di Excel: **13** (`X/XI/XII MERDEKA 1–5`) — format sudah benar.
- Penyebab: **master data kelas kosong** + **tidak ada Tahun Ajaran aktif** →
  resolver memblokir seluruh baris sesuai desain.
- Verdict: **masalah data**, bukan bug resolver; ditambah gap UI (tidak ada halaman
  pengelolaan Tahun Ajaran/Kurikulum/Kelas).
