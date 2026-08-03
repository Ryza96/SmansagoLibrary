# WO12 — UAT REPORT FINAL (Milestone A — User Acceptance setelah WO-11A)

- **WO:** WO-12 T-A — UAT FINAL
- **Mode:** READ ONLY / AUDIT ONLY.
- **Skenario dijalankan:** smoke suites yang mereproduksi alur produksi user (create/edit/delete/activate/deactivate/clone) pada fresh DB; UI diverifikasi secara statis (grep bundle + kode layer).

## Ringkasan
**95+ jalur user-facing Milestone A diterima.** Alur inti yang sebelumnya tidak dapat dilakukan dari UI (Buka/Tutup Tahun) kini berfungsi penuh setelah WO-11A mengekspos `activate`/`deactivate` ke preload, env.d.ts, dan tombol daftar.

## Alur UAT per Fitur

### Academic Year
| Alur User | Langkah UAT | Hasil |
|-----------|-------------|-------|
| Tambah tahun baru (nonaktif) | wo5 UAT 1 | PASS |
| Tambah tahun aktif → tahun lama nonaktif otomatis | wo5 UAT 2; wo4 STEP 2 | PASS |
| **Buka Tahun** dari daftar (activate) → tahun lama nonaktif | wo5 UAT 3; wo4 STEP 4-5; wo11 STEP 3,5 | PASS |
| **Tutup Tahun** (deactivate) — menutup satu-satunya tahun aktif ditolak | wo11 STEP 4,7 | PASS |
| Edit nama tahun (tanpa ubah status) | wo5 UAT 3b; wo11 STEP 10 | PASS |
| Edit mencoba ubah status (isActive) → ditolak | wo5 UAT 3c; wo11 STEP 8 | PASS |
| Hapus tahun berkelas → ditolak | wo5 UAT 4 | PASS |
| Hapus tahun tanpa kelas | wo5 UAT 5 | PASS |
| Duplikat nama tahun → ditolak | wo5 UAT 7; wo11 STEP 11,16 | PASS |

### Curriculum
| Alur User | Langkah UAT | Hasil |
|-----------|-------------|-------|
| Tambah / edit / hapus kurikulum | wo6 UAT 1,3,5 | PASS |
| Duplikat nama → ditolak | wo6 UAT 2,3 | PASS |
| Hapus kurikulum berkelas → ditolak | wo6 UAT 4 | PASS |
| Cari kurikulum | wo6 UAT 6 | PASS |

### Class
| Alur User | Langkah UAT | Hasil |
|-----------|-------------|-------|
| Tambah kelas (payload UI) | wo8 UAT 1 | PASS |
| Tingkat tak valid / kosong → ditolak | wo7 UAT 2 | PASS |
| Input `" xi "` → ternormalisasi XI | wo7 UAT 3 | PASS |
| Duplikat komposit (tahun+kurikulum+level+paralel) → ditolak | wo7 UAT 4; wo8 UAT 6 | PASS |
| Edit guru / isActive | wo7 UAT 7; wo8 UAT 4 | PASS |
| Ubah educationLevel/parallel saat edit → ditolak (immutable) | wo7 UAT 5,6 | PASS |
| Hapus kelas beranggota → ditolak | wo7 delete 400; wo8 UAT 7 | PASS |
| Hapus kelas tanpa anggota | wo7 UAT 7; wo8 UAT 8 | PASS |
| Filter daftar per tahun/kurikulum/search | wo8 UAT 3 | PASS |

### Class Clone
| Alur User | Langkah UAT | Hasil |
|-----------|-------------|-------|
| Clone kelas ke tahun baru (field struktur tersalin; guru=null; isActive=true) | wo9 UAT 1,2 | PASS |
| Clone ke tahun yang sudah punya kelas → skip | wo9 UAT 4 | PASS |
| Jalankan ulang → idempoten (created=0) | wo9 UAT 3 | PASS |
| Sumber = target → ditolak | wo9 UAT 5 | PASS |

## Verifikasi UI (statis — karena audit READ ONLY)
- **Daftar Tahun Ajaran** menampilkan status (Aktif/Nonaktif) + tombol **Buka Tahun**/**Tutup Tahun** dengan konfirmasi dan alert sukses, lalu refresh — `AcademicYearListPage.tsx:57-72,103-113`; bundle renderer memuat string.
- **Form Tahun Ajaran** tidak lagi menawarkan checkbox aktif — status tampil disabled + hint — `AcademicYearForm.tsx:99-100`; payload create/update tanpa `isActive`.
- Navigasi: sidebar "Tahun Ajaran" → list → `new`/`:id/edit`; halaman edit membaca via `findById`.
- Preload & env.d.ts mengetik penuh `academicYears.*` termasuk `activate`/`deactivate`.

## Batasan UAT
- Audit dilakukan headless (smoke + grep bundle), bukan klik manual pada Electron GUI — konsisten dengan prosedur WO-12 pertama.
- Verifikasi routing/sidebar/navigation/labels via sumber + bundle grep; tidak ada temuan yang memerlukan aksi user lanjut.

## Bug / Temuan UAT
- **Tidak ada** bug yang ditemukan pada re-test ini.

## Rekomendasi
Fitur Milestone A **LULUS UAT** untuk jalur utama. Tidak ada item menghalangi rilis dari sisi fungsional maupun kontrak.
