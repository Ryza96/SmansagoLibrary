# SPRINT 11 — WO-11-B: Template Import v2 (Backward Compatible) — Implementation Report

> Status: **DONE — menunggu review Product Owner**
> Tanggal: 2026-08-01
> Scope: Membuat **Template Import Buku v2.0** (17 kolom) sesuai spesifikasi PO. HANYA mengubah Template Generator / aset template — **TIDAK ada perubahan pipeline import**.

---

## 1. Files Changed

**Tidak ada file kode yang diubah.** Pipeline import (Header Normalizer, Workbook Reader, Validation Engine, Matching Engine, BookImportService, Repository, Database, Preview UI, Auto Create, Barcode, Inventory, Multi Copy) **tidak tersentuh** — sesuai out-of-scope.

## 2. New Files

| File | Keterangan |
|------|------------|
| `templates/Template_Import_Buku_v2.0.xlsx` | **Baru** — template import v2.0, 17 kolom, satu sheet `Import Buku`. |
| `templates/Template_Import_Buku_v2.0_screenshot.png` | **Baru** — render preset dari nilai + style asli file (2215×118) untuk review PO. |
| `SPRINT11_WO11B_IMPLEMENTATION_REPORT.md` | Baru — dokumen ini. |

**Backward compatibility:** `templates/Template_Import_Buku_v1.0.xlsx` (11.993 byte) **TIDAK diubah** — tetap ada, file v2.0 ditambahkan di sampingnya.

### 2.1 Spesifikasi yang Diimplementasikan

| Aspek | Hasil |
|-------|-------|
| Sheet | Satu, bernama `Import Buku` |
| Header baris 1 (17 kolom, urutan persis PO) | `Judul` · `Penulis` · `Penerbit` · `Tahun Terbit` · `Kategori` · `Jumlah Copy` · `ISBN` · `Bahasa` · `Edisi` · `Jumlah Halaman` · `Deskripsi` · `Lokasi Rak` · `Kondisi Awal` · `Sumber Perolehan` · `Tanggal Perolehan` · `Harga Perolehan` · `Kode Buku` |
| Header style (mengikuti v1) | Bold, teks putih, fill `#4472C4` (COM: `headerFill=12874308` = RGB(68,114,196)) |
| Freeze Top Row | Ya (`SplitRow=1`, `FreezePanes=True`) |
| Auto Width | Ya (kolom A–Q `AutoFit`; R=2 spasi; S=95 petunjuk) |
| Contoh data | Diperbarui mengikuti 17 kolom (Laskar Pelangi / Atomic Habits) |
| Petunjuk | Diperbarui (kolom S, baris 1–11): judul fill `#2F5496` putih + blok `#DDEBF7` + border — gaya sama dengan v1 |

### 2.2 Contoh Data

| Judul | Penulis | Penerbit | Tahun | Kategori | Jml Copy | ISBN | Bahasa | Edisi | Hal | Deskripsi | Rak | Kondisi | Sumber | Tanggal | Harga | Kode Buku |
|-------|---------|----------|-------|----------|----------|------|--------|-------|-----|-----------|-----|---------|--------|---------|-------|-----------|
| Laskar Pelangi | Andrea Hirata | Bentang Pustaka | 2005 | Novel | 1 | 9789793062792 | Bahasa Indonesia | Cetakan 1 | 529 | Kisah perjuangan… | Rak A-1 | Baik | PEMBELIAN | 01/07/2005 | 85000 | (kosong) |
| Atomic Habits | James Clear | Gramedia | 2019 | Pengembangan Diri | 2 | 9786020633176 | Bahasa Indonesia | Cetakan 1 | 352 | Panduan membangun… | Rak B-2 | Baik | DONASI | 15/01/2020 | (kosong) | (kosong) |

### 2.3 Format Sel (berlaku baris 2–200, agar input user berikutnya bertipe benar)

| Kolom | Format |
|-------|--------|
| D (Tahun Terbit) | Number `0` |
| F (Jumlah Copy) | Number `0` |
| G (ISBN) | **Text `@`** (dipastikan tersimpan sebagai string, konsisten dengan v1) |
| J (Jumlah Halaman) | Number `0` |
| O (Tanggal Perolehan) | Date `dd/mm/yyyy` |
| P (Harga Perolehan) | Number `#,##0` |

### 2.4 Petunjuk Penggunaan (kolom S)

```
PETUNJUK PENGGUNAAN
1. Jangan mengubah nama header.
2. Jangan mengubah urutan kolom.
3. Mulai isi data pada baris kedua.
4. Simpan sebagai .xlsx.
5. Kolom WAJIB: Judul, Penulis, Penerbit, Tahun Terbit, Kategori, Jumlah Copy.
6. Kolom OPSIONAL: ISBN, Bahasa, Edisi, Jumlah Halaman, Deskripsi, Lokasi Rak, Kondisi Awal, Sumber Perolehan, Tanggal Perolehan, Harga Perolehan, Kode Buku.
7. Jumlah Copy bertipe Number (minimal 1).
8. Tahun Terbit, Jumlah Halaman, Harga Perolehan bertipe Number.
9. ISBN bertipe Text.
10. Tanggal Perolehan bertipe Date.
```

## 3. Validation

Diverifikasi dengan **`read-excel-file` v9.3.5** — parser yang SAMA dengan `WorkbookReaderService` aplikasi:

| # | Assertion | Hasil |
|---|-----------|-------|
| 1 | `Template_Import_Buku_v1.0.xlsx` tetap dapat dibuka (1 sheet `Import Buku`, header 6 kolom, contoh data utuh) | PASS |
| 2 | `Template_Import_Buku_v2.0.xlsx` dapat dibuka (1 sheet `Import Buku`) | PASS |
| 3 | Header v2 = 17 kolom **persis** spesifikasi PO (urutan sama) | PASS |
| 4 | ISBN contoh data bertipe **string** (konsisten v1; bukan number) | PASS |
| 5 | Tahun Terbit / Jumlah Copy / Jumlah Halaman / Harga bertipe **number**; Tanggal Perolehan bertipe **Date** | PASS |
| 6 | Header style v2 identik v1 (bold, putih, `#4472C4`); Freeze Top Row aktif | PASS |
| 7 | **Tidak ada perubahan pipeline import** — zero file kode berubah | PASS |

### Verifikasi Styling (COM introspection)

```
v2: headerBold=True headerFontColor=16777215 headerFill=12874308 (#4472C4)
    splitRow=1 freeze=True
    numFmt D=0 F=0 G=@ J=0 O=dd/mm/yyyy P=#,##0
    petunjuk title fill=9851951 (#2F5496)   — sama persis nilai v1
```

### Verifikasi Screenshot (pixel scan)

`2215×118`; warna dominan: `FFFFFF` (latar), `4472C4` (header, 9.187 px), `DDEBF7` (blok petunjuk, 6.693 px), `2F5496` (judul petunjuk, 2.058 px), `C8C8C8` (grid), `1E1E1E` (teks gelap).

> **Catatan transparan:** screenshot adalah render preset yang digambar ulang dari nilai + style asli file (baca via COM), bukan tangkapan jendela monitor — pendekatan sama dengan screenshot v1.

## 4. Build PASS

```
npm run build
✓ out/main/index.js   1,746.61 kB
✓ out/preload/index.js  6.59 kB
✓ out/renderer/assets/index-DiqpmWbM.js  887.52 kB
BUILD_EXIT=0
```

## 5. Lint PASS

```
npm run lint  (tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit)
LINT_EXIT=0
```

## 6. Rollback

- **Hapus 3 file baru:** `templates/Template_Import_Buku_v2.0.xlsx`, `templates/Template_Import_Buku_v2.0_screenshot.png`, dan laporan ini.
- Template v1.0 tetap utuh — tidak ada yang perlu di-restore.
- Tidak ada kode aplikasi yang berubah → tidak ada rollback kode/migration.

## 7. Architecture Checklist

| # | Item | Status |
|---|------|--------|
| 1 | Hanya Template Generator / aset template yang diubah | ✅ |
| 2 | Pipeline import TIDAK diubah (normalizer/reader/validation/matching/service/repo/DB/preview/auto-create/barcode/inventory/multi-copy) | ✅ |
| 3 | Template v1.0 dipertahankan (backward compatible) | ✅ |
| 4 | v2.0 = 17 kolom sesuai spesifikasi PO, urutan persis | ✅ |
| 5 | Header baris pertama, Freeze Top Row, Auto Width, style header mengikuti v1 | ✅ |
| 6 | Contoh data & petunjuk diperbarui; sheet tetap satu | ✅ |
| 7 | ISBN contoh data bertipe string (parity v1) | ✅ |
| 8 | Lint PASS + Build PASS | ✅ |
| 9 | Siap 1 commit setelah approval PO | ✅ |

---

**Status: DONE — Architecture Gate BERHENTI**, menunggu review Product Owner.
