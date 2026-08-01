# SPRINT3_WO1_TEMPLATE_IMPLEMENTATION_REPORT.md — Template Excel Import Buku v1.0

Status: **COMPLETE — READY untuk review Product Owner**
Tanggal: 2026-08-01
Peran: Software Engineer (implementasi visual murni — tanpa perubahan engine)

---

## 1. Ringkasan

Template Excel resmi **v1.0** berhasil dibuat dan siap direview PO.

| Aset | Lokasi |
|------|--------|
| **Template (.xlsx)** | `templates/Template_Import_Buku_v1.0.xlsx` |
| **Screenshot (PNG)** | `templates/Template_Import_Buku_v1.0_screenshot.png` |
| Laporan ini | `SPRINT3_WO1_TEMPLATE_IMPLEMENTATION_REPORT.md` |

**Sesuai instruksi:** TIDAK ada perubahan kode. Validation Engine, Header Normalizer,
Workbook Reader, Matching, Auto Create, dan Import UI **tidak disentuh**. Template ini
hanya implementasi visual untuk review PO.

---

## 2. Spesifikasi yang Diimplementasikan

| Aspek | Hasil | Bukti |
|-------|-------|-------|
| Sheet | Satu sheet bernama **`Import Buku`** | COM introspection: `SHEET_COUNT=1`, `SHEET1_NAME=Import Buku` |
| Header (baris 1) | `Judul` · `Penulis` · `Penerbit` · `Tahun Terbit` · `Kategori` · `ISBN` | COM + `read-excel-file` |
| Header Bold | Ya (seluruh A1:F1) | `Font.Bold = True` |
| Warna header | Fill biru `#4472C4`, teks putih | COM: `fill=RGB(68,114,196)`, `fontColor=RGB(255,255,255)` |
| Freeze Top Row | Ya (row 1 beku) | COM: `SplitRow=1`, `FreezePanes=True` |
| Auto Width | Ya (AutoFit A..F, min 12; H=62) | COM: A=12.86, B=12.57, C=15, D=12, E=17.86, F=13.43 |
| Tahun Terbit → Number | Ya (nilai 2005, 2019 bertipe number; format `0`) | COM: `D2 numFmt='0'`; `read-excel-file`: `2005(number)` |
| ISBN → Text | Ya (nilai string; format `@`) | COM: `F2 numFmt='@'`; `read-excel-file`: `9789793062792(string)` |
| Contoh data | Baris 2-3 (Laskar Pelangi / Atomic Habits) persis sesuai instruksi | COM + `read-excel-file` |
| Petunjuk di sisi kanan | Kolom **H** (kanan worksheet, bukan di atas header) — judul + 7 baris | COM: H1..H8 terisi |

### 2.1 Contoh Data (persis instruksi PO)

| Judul | Penulis | Penerbit | Tahun Terbit | Kategori | ISBN |
|-------|---------|----------|--------------|----------|------|
| Laskar Pelangi | Andrea Hirata | Bentang Pustaka | 2005 | Novel | 9789793062792 |
| Atomic Habits | James Clear | Gramedia | 2019 | Pengembangan Diri | 9786020633176 |

### 2.2 Petunjuk Penggunaan (kolom H, baris 1-8)

```
PETUNJUK PENGGUNAAN
1. Jangan mengubah nama header.
2. Jangan mengubah urutan kolom.
3. Mulai isi data pada baris kedua.
4. Simpan sebagai .xlsx.
5. ISBN bertipe Text.
6. Tahun Terbit bertipe Number.
7. Judul, Penulis, dan Penerbit wajib diisi.
```

Blok petunjuk diberi fill biru muda `#DDEBF7` + border, judul fill biru tua `#2F5496` teks putih,
supaya kontras dan mudah dibaca tanpa mengganggu area data.

---

## 3. Metode Pembuatan

- Dibuat via **Excel COM automation** (`Excel.Application`, format `xlOpenXMLWorkbook`/51)
  agar hasilnya file `.xlsx` Office asli dengan styling native (bold, fill, freeze, number/text format).
- Layout sheet:
  - Row 1 = header 6 kolom.
  - Row 2-3 = contoh data.
  - Kolom G = spasi; kolom H = petunjuk penggunaan.
  - Kolom D (Tahun Terbit) diformat `0`, kolom F (ISBN) diformat `@` — berlaku sampai baris 200
    agar sel yang diketik user berikutnya otomatis bertipe benar.

---

## 4. Verifikasi

### 4.1 Verifikasi Konten (pembaca pihak ketiga = sama dengan aplikasi)

Menggunakan **`read-excel-file` v9.3.5** (parser yang sama dengan `WorkbookReaderService` aplikasi):

```
SHEET_COUNT: 1
SHEET_NAME: "Import Buku"
ROW1: Judul | Penulis | Penerbit | Tahun Terbit | Kategori | ISBN
ROW2: Laskar Pelangi | Andrea Hirata | Bentang Pustaka | 2005(number) | Novel | 9789793062792(string)
ROW3: Atomic Habits | James Clear | Gramedia | 2019(number) | Pengembangan Diri | 9786020633176(string)
+ petunjuk di kolom H (baris 1-8)
```

### 4.2 Verifikasi Styling (COM introspection)

- Header A1:F1: bold, font putih, fill `RGB(68,114,196)`.
- `D2/D3` numFmt `'0'` (Number), `F2/F3` numFmt `'@'` (Text).
- `SplitRow=1`, `FreezePanes=True`.
- H1 merged, fill `RGB(47,84,150)`; H2-H8 fill `RGB(221,235,247)`.

### 4.3 Verifikasi Screenshot (pixel scan)

PNG `1230×250`; scan programatik:
- Header blue `#4472C4`: **23.517 px** (baris header ter-render).
- Judul petunjuk `#2F5496`: 18.789 px; blok petunjuk `#DDEBF7`: 79.994 px.
- 7 baris petunjuk (H2-H8) masing-masing memuat teks gelap (117-240 px/baris).
- Teks putih bold pada header terdeteksi.

> **Catatan transparan:** screenshot dihasilkan sebagai **render presetia yang digambar ulang
> dari nilai + style asli file** (baca via COM), bukan tangkapan layar monitor — karena tangkapan
> jendela Excel di lingkungan ini tidak andal (rendering window gagal ter-posisi).
> Seluruh nilai & format yang digambar **persis dari file** (diverifikasi di §4.1 dan §4.2).

---

## 5. Catatan Kompatibilitas (PENTING — untuk review PO)

Template ini memakai header **`Tahun Terbit`**, sedangkan sistem saat ini:

- `HeaderNormalizerService` hanya mengenal sinonim `publisher → penerbit`. Header `Tahun Terbit`
  **belum dikenali** → jika template ini di-upload ke aplikasi **saat ini**, validasi akan gagal
  (`IMP-011`/`IMP-012`) karena normalizer tidak memetakan `tahun terbit` → `tahun`.
- Kontrak template aplikasi v3 masih `Tahun` (bukan `Tahun Terbit`).

**Ini sesuai instruksi PO:** engine TIDAK diubah pada WO ini. Perubahan engine (menambah sinonim
header dan/atau mengubah kontrak template) dilakukan **setelah PO mereview template**.

Item lanjutan yang direkomendasikan di work order berikutnya (setelah review PO):
1. Tambah sinonim `tahun terbit → tahun` di `HeaderNormalizerService`.
2. (Opsional) ganti label kontrak template dari `Tahun` → `Tahun Terbit` di `bookImport.template.ts`.
3. (Opsional, dari spec) kolom `Jumlah Copy` + persist `publicationYear` — roadmap kontrak v4.

---

## 6. Status

**DONE — menunggu review Product Owner.** Tidak ada code change, tidak ada commit.
