# NOTIFICATION UX AUDIT

**Mode:** READ-ONLY (tidak ada perubahan source, tidak ada commit, tidak ada UI baru)
**Tanggal:** 2026-08-05
**Cakupan:** Seluruh penggunaan notifikasi/pemberitahuan di aplikasi — `window.alert`, `window.confirm`, dialog Electron (`dialog.showSaveDialog`/`showMessageBox`), `Notification`, toast/snackbar, dan pola non-blocking inline.
**Metode:** Grep global `(alert|confirm)\(` di `src/` (53 match, 1 false positive) + `showErrorBox|showMessageBox|new Notification|toast|sonner|react-toastify|notistack` di seluruh repo (0 match di source) + pembacaan konteks setiap temuan.

---

## 1. Executive Summary

- **Tidak ada infrastruktur notifikasi global** (toast/snackbar/Notification) di aplikasi — grep = 0 match. Seluruh feedback memakai native `window.alert` / `window.confirm` secara ad-hoc di 25+ file.
- **53 penggunaan** native blocking dialog: 13 `confirm` (aksi destruktif/state-change), 27 `alert` error, 4 `alert` sukses, 3 `alert` warning alur scan barcode, 6 `alert` placeholder ("fitur belum tersedia").
- **Kekurangan utama:** feedback **sukses** memakai blocking `alert` (wajib klik OK utk pesan yang seharusnya transient); **2 halaman anggota tidak punya try/catch** di handler delete (error = unhandled promise rejection tanpa feedback user); string pesan **hardcoded inline** bercampur dengan label constants; alur scan barcode memakai blocking dialog yang mengganggu ritme kerja.
- **Pola baik yang sudah ada:** `BookImportPreviewPage` memakai state inline (`importSuccess`/`importError`) non-blocking; `BorrowReceiptPreviewPage` memakai chip halaman + status inline untuk print/PDF sukses. Ini bisa dijadikan acuan standardisasi.
- **Main-process:** hanya `dialog.showSaveDialog` (file picker, bukan notifikasi) di 3 file; **tidak ada** `showErrorBox`/`showMessageBox`/`new Notification`.

---

## 2. Inventaris Lengkap (53 match)

### 2.A Konfirmasi destruktif / state-change — `window.confirm` (13)

| # | File:Line | Aksi | Catatan |
|---|-----------|------|---------|
| 1 | `src/pages/BooksPage.tsx:40` | Hapus buku | label `LABELS.BOOK.CONFIRM_DELETE` |
| 2 | `src/pages/MembersPage.tsx:38` | Hapus anggota | string inline `Hapus anggota {n} ({no})?` — **tanpa try/catch** |
| 3 | `src/pages/MemberListPage.tsx:46` | Hapus anggota | string inline — **tanpa try/catch** |
| 4 | `src/pages/master/AuthorListPage.tsx:47` | Hapus author | label |
| 5 | `src/pages/master/CategoryListPage.tsx:43` | Hapus kategori | label |
| 6 | `src/pages/master/PublisherListPage.tsx:43` | Hapus penerbit | label |
| 7 | `src/pages/master/CurriculumListPage.tsx:43` | Hapus kurikulum | label |
| 8 | `src/pages/master/ClassListPage.tsx:83` | Hapus kelas | label `LABELS.CLASS.CONFIRM_DELETE` |
| 9 | `src/pages/master/AcademicYearListPage.tsx:48` | Hapus tahun ajaran | label |
| 10 | `src/pages/master/AcademicYearListPage.tsx:58` | Aktifkan tahun | label `ACTIVATE_CONFIRM` + guard 1-aktif |
| 11 | `src/pages/master/AcademicYearListPage.tsx:69` | Nonaktifkan tahun | label |
| 12 | `src/pages/promotion/PromotionPage.tsx:134` | Eksekusi promosi (Mode A) | label `CONFIRM_EXECUTE` |
| 13 | `src/components/books/BookDetail.tsx:78` | Decommission eksemplar | `LABELS.COPY.CONFIRM_...` |

### 2.B Error — `alert(message)` / `alert(err.message)` (27)

**Form save gagal (7):** `AuthorFormPage.tsx:36`, `CategoryFormPage.tsx:36`, `PublisherFormPage.tsx:36`, `CurriculumFormPage.tsx:36`, `ClassFormPage.tsx:64`, `AcademicYearFormPage.tsx:42` — semuanya `alert(err.message)` dari `AppError` (guard service).

**List delete / toggle gagal (7):** `AuthorListPage.tsx:52`, `CategoryListPage.tsx:48`, `PublisherListPage.tsx:48`, `CurriculumListPage.tsx:48`, `ClassListPage.tsx:88`, `AcademicYearListPage.tsx:53,64,75`, `BooksPage.tsx:46`, `BookDetail.tsx:83`.

**Circulation (7):** `BorrowingsPage.tsx:141` (save gagal), `:154` (print gagal); `ReturnsPage.tsx:32` (findByBarcode gagal), `:57` (return gagal), `:70` (print gagal).

**Settings (1):** `SettingsPage.tsx:69` — `alert(validationError)`.

**Promotion (2):** `PromotionPage.tsx:126` (preview gagal), `:145` (execute gagal).

**Preview/Print/PDF (3):** `BorrowReceiptPreviewPage.tsx:154,171`; `LabelPreviewPage.tsx:72`.

### 2.C Success — `alert()` blocking (4)

| # | File:Line | Pesan | Masalah |
|---|-----------|-------|---------|
| 1 | `src/pages/BorrowingsPage.tsx:130` | "Transaksi berhasil disimpan." | Blocking sebelum `navigate` ke preview |
| 2 | `src/pages/ReturnsPage.tsx:49` | "Buku berhasil dikembalikan." | Blocking di tengah alur scan berikutnya |
| 3 | `src/pages/master/AcademicYearListPage.tsx:61` | `ACTIVATED` | Blocking |
| 4 | `src/pages/master/AcademicYearListPage.tsx:72` | `DEACTIVATED` | Blocking |

### 2.D Warning — alur scan barcode (3)

`BorrowingsPage.tsx:82` "Buku sudah dipilih.", `:90` "Barcode tidak ditemukan.", `:97` "Buku tidak tersedia." — blocking dialog di tengah ritme scan keyboard (Enter).

### 2.E Placeholder — fitur belum tersedia (6)

| # | File:Line | Fitur |
|---|-----------|-------|
| 1 | `src/components/books/BookForm.tsx:285` | Simpan Draft |
| 2 | `src/components/members/MemberForm.tsx:199` | Simpan Draft |
| 3 | `src/components/members/MembershipSection.tsx:60` | Tambah tipe anggota |
| 4 | `src/pages/MemberDetailPage.tsx:203` | Cetak Kartu |
| 5 | `src/pages/MemberDetailPage.tsx:311` | Edit data pribadi |
| 6 | `src/pages/MemberDetailPage.tsx:321` | Edit alamat |

### 2.F False positive (dikecualikan)
- `borrow_card_wo1_smoke/smoke.ts:210` — string test data `<script>alert('x')</script>`, bukan UX app.

---

## 3. Temuan (Findings)

### F1 — Feedback SUKSES memakai blocking `alert` (RENDAH-MODERATE, UX utama)
4 lokasi (2.C). Pesan sukses memaksa klik OK. Terburuk: `BorrowingsPage:130` menaruh alert **sebelum** `navigate(receiptPreviewPath)` — user harus klik OK lalu di-redirect.

### F2 — Tidak ada sistem toast/notifikasi global (INFO, arsitektur)
Grep `toast|sonner|react-toastify|notistack|Notification|ErrorBoundary` = 0. Setiap halaman mengimplementasikan feedback sendiri. Sudah dicatat di `BUG_DELETE_BOOK_INVESTIGATION.md:130` sebagai tech debt.

### F3 — Handler delete anggota TANPA try/catch (BUG-LEVEL)
`MembersPage.tsx:37-41` dan `MemberListPage.tsx:45-49` memanggil `api.members.delete` tanpa `try/catch`. Bila service menolak (mis. member punya riwayat peminjaman → AppError 400), promise **reject tanpa feedback** → unhandled rejection. Semua list page lain membungkus delete dengan try/catch + `alert(err.message)`.

### F4 — String pesan bercampur: inline hardcoded vs label constants (RENDAH)
- Inline Indonesian: `BorrowingsPage` (5 pesan), `ReturnsPage` (2), `MemberListPage`/`MembersPage` confirm.
- Label constants: `BooksPage`, semua master list, `PromotionPage`.
Tidak konsisten untuk localization/maintainability.

### F5 — Alur scan barcode diinterupsi blocking dialog (RENDAH)
3 pesan (2.D) muncul di alur keyboard (barcode scanner = Enter). Setiap kejadian membutuhkan OK/Enter ekstra di tengah pemindaian beruntun.

### F6 — Placeholder alert untuk tombol yang TIDAK boleh diklik (RENDAH)
6 tombol (2.E) aktif tapi menampilkan "belum tersedia". UX lebih baik: `disabled` dengan tooltip, atau tombol disembunyikan sampai fitur ada.

### F7 — `window.confirm` native tidak konsisten dengan styling app (INFO)
13 lokasi. Native dialog tidak punya branding/styling; tidak bisa menampilkan detail (mis. nama entitas, jumlah affected). Master list sudah pakai confirm template di banyak tempat — konsisten antar halaman, tapi tetap native.

### F8 — `AppError.message` sebagai satu-satunya kontrak feedback error (INFO, sudah konsisten)
Pola `alert(err.message)` di ~20 lokasi berarti UX bergantung pada kualitas pesan service. Bagus (konsisten), tapi pesan service kadang teknis (mis. guard "duplikat").

### F9 — Main-process: save dialog vs notification (INFO, OUT OF SCOPE)
`dialog.showSaveDialog` di `electron/ipc/book-import.ipc.ts:40`, `member.ipc.ts:31`, `electron/main/services/print.service.ts` = **file picker**, bukan notifikasi. Tidak ada `showMessageBox`/`showErrorBox`/`new Notification` — pesan error di main dipropagasi ke renderer via IPC reject → di-`alert` renderer (pola F8). Konsisten, tidak perlu diubah.

---

## 4. Rekomendasi (berjenjang)

### T1 — Quick wins (bug + non-blocking, tanpa arsitektur baru)
1. **F3:** Bungkus `api.members.delete` di `MembersPage` & `MemberListPage` dengan try/catch → `alert(err.message)` (menyamakan pola list lain).
2. **F1:** Ganti 4 success-alert dengan **status inline transient** (pola `BookImportPreviewPage`/`BorrowReceiptPreviewPage`): setelah sukses, tampilkan strip hijau 3 detik di dalam halaman. Pada `BorrowingsPage`, hapus alert dan langsung `navigate` (preview = feedback sukses).
3. **F5:** Ubah 3 pesan scan barcode jadi **baris status inline** (mis. teks di bawah input barcode, warna amber/rose) — tidak menghentikan alur scan.

### T2 — Sistem toast ringan (TANPA dependency baru)
Implementasikan provider minimal (`ToastProvider` + `useToast()`) memakai state React + CSS app yang ada, dengan varian `success | error | warning | info` dan auto-dismiss. Migrasi bertahap:
- Success/warning: `alert` → `toast.success(...)` (F1, 2.D, 2.C).
- Error: `alert(err.message)` → `toast.error(err.message)` (2.B) — opsi tetap dipertahankan untuk error yang butuh aksi (bisa pakai variant persistent).

### T3 — Modal konfirmasi styled (menggantikan `window.confirm`)
Buat komponen `ConfirmDialog` reusable (judul + body + cancel/confirm, styling app) menggantikan 13 `window.confirm` (2.A). Dapat menampilkan detail entitas dan "yang akan terpengaruh".

### T4 — Placeholder buttons (F6)
Tombol "Simpan Draft", "Cetak Kartu", "Edit data pribadi/alamat", "Tambah tipe anggota": `disabled` + tooltip ("Segera hadir") atau disembunyikan; hapus placeholder-alert.

### T5 — Konsolidasi string pesan (F4)
Pindahkan seluruh string inline ke `labels.ts` (blok notifikasi) agar satu sumber pesan, konsisten dengan halaman lain.

---

## 5. Lampiran — Rekap per Kategori

| Kategori | Jumlah | Keterangan |
|----------|-------:|------------|
| `window.confirm` (destruktif/state) | 13 | delete ×9, activate/deactivate ×2, execute ×1, decommission ×1 |
| `window.alert` error | 27 | form ×7, list ×9, circulation ×7, promotion ×2, preview/print ×3, settings ×1 |
| `window.alert` success | 4 | borrow, return, activate, deactivate |
| `window.alert` warning scan | 3 | borrow scan |
| `window.alert` placeholder | 6 | fitur belum tersedia |
| Toast/snackbar/Notification | 0 | tidak ada infra |
| `dialog.showSaveDialog` | 3 | file picker (bukan notifikasi) |
| `showMessageBox`/`showErrorBox`/`new Notification` | 0 | tidak digunakan |

**Prioritas penanganan:** F3 (bug) → F1 (UX sukses) → F5 (alur scan) → F6 (placeholder) → T2/T3/T4/T5 (standardisasi).

**Status: DONE — READ ONLY.** Menunggu review user; tidak ada perubahan source/commit.
