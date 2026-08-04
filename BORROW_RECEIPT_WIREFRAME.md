# BORROW RECEIPT REDESIGN — WIREFRAME BORROW CARD

| | |
|---|---|
| **WO** | Borrow Receipt Redesign — Phase 1 Discovery & Design |
| **Mode** | DISCOVERY ONLY / READ ONLY |
| **Tanggal** | 2026-08-04 |
| **Status** | Menunggu approval Product Owner |

Dokumen ini menjawab pertanyaan PO #7: **mockup wireframe Borrow Card 11 cm × 6 cm (landscape)**.

---

## 1. Spesifikasi Fisik

| Properti | Nilai |
|---|---|
| Orientasi | **Landscape** |
| Lebar | **110 mm** (11 cm) |
| Tinggi | **60 mm** (6 cm) |
| Margin internal | 3 mm tiap sisi (content 104 × 54 mm) |
| Font family | Arial / Segoe UI, ukuran 6–9 pt |
| Warna dasar | Putih `#ffffff`, teks `#1f2937`, aksen `#1d4ed8` |
| Kartu | Border 1px `#cbd5e1`, sudut membulat 2 mm |

> Implementasi CSS: `@page { size: 110mm 60mm; margin: 0 }` dan `.borrow-card { width:110mm; height:60mm }`. Ukuran **fixed** — tinggi tidak boleh mengikuti jumlah buku (lihat §4 tentang penanganan overflow).

---

## 2. Wireframe ASCII (110mm × 60mm)

```
        ┌──────────────────────────────────────────────────────────────────┐
 0mm    │  ┌─────┐  PERPUSTAKAAN SMP NEGERI 1 TUNAS BANGSA                 │
        │  │ LOGO│  APLibrary                                              │
  14mm  │  └─────┘                                                         │
        │  ┌───────┐ ┌─────────────────────────┐  ┌─────────────────────┐  │
        │  │ FOTO  │ │ Nama      : BUDI SANTOSO │  │ No. Peminjaman      │  │
  24mm  │  │ ANGGOTA│ │ No. Anggota: S-000123    │  │ PJ/202607/0001      │  │
        │  │ 18×22 │ │ Jenis     : Siswa        │  │ Tgl Pinjam  01-08-26│  │
        │  └───────┘ │ Kelas     : X Merdeka 1  │  │ Jatuh Tempo 08-08-26│  │
  34mm  │            │                          │  │ Petugas     Siti A. │  │
        │            └──────────────────────────┘  └─────────────────────┘  │
  36mm  │  ┌─────────────────────────────────────────────────────────────┐ │
        │  │ 1. Laskar Pelangi ............................ INV-000001    │ │
  48mm  │  │ 2. Matematika untuk Kelas X .................. INV-000002    │ │
        │  │    +1 lainnya                                                 │ │
        │  └─────────────────────────────────────────────────────────────┘ │
  52mm  │  Jumlah: 3           STATUS: DIPINJAM         ┌─────┐  Petugas  │
        │                                               │ QR  │  ________│
  60mm  │                                               └─────┘  ( Siti A)│
        └──────────────────────────────────────────────────────────────────┘
```

> **Legenda zona:** Header (0–14mm) · Body identitas+transaksi (14–36mm) · Daftar buku (36–48mm) · Footer (48–60mm).

---

## 3. Spesifikasi Zona

### 3.1 HEADER — 14 mm
| Elemen | Posisi | Isi | Catatan |
|---|---|---|---|
| Logo sekolah | kiri, 10×10 mm | `Setting.logoPath` → data URI | Kosong → placeholder lingkaran inisial |
| Nama perpustakaan | kiri-tengah, bold ~9pt | `libraryName` | Baris pertama |
| Nama sekolah | bawahnya, ~7pt | `schoolName` | Baris kedua, warna lebih redup |

### 3.2 BODY IDENTITAS ANGGOTA (kiri) + TRANSAKSI (kanan) — 22 mm
**Kolom kiri (member):**
| Elemen | Isi | Kondisi |
|---|---|---|
| Foto | 18×22 mm, border 1px | Phase 1: **avatar inisial** (belum ada kolom foto di `Member`); bila `Member.photoPath` ada di masa depan → foto |
| Nama | `member.fullName` | |
| No. Anggota | `member.memberNumber` | |
| Jenis Anggota | `memberTypeLabel(member.memberType)` → Siswa/Guru/Umum | |
| Kelas | `borrowing.className` | **Hanya untuk Siswa**; guru/umum/`null` → baris disembunyikan |

**Kolom kanan (transaksi):**
| Elemen | Isi |
|---|---|
| No. Peminjaman | `borrowing.borrowNumber` |
| Tanggal Pinjam | `borrowDate` (format `id-ID`, mis. "01-08-2026") |
| Tanggal Jatuh Tempo | `dueDate` |
| Nama Petugas | `Setting.librarianName` |

### 3.3 DAFTAR BUKU — 12 mm (variable, terbatas)
| Elemen | Isi |
|---|---|
| Nomor urut | 1, 2, 3, … |
| Judul buku | `detail.bookCopy.book.title` (1 baris, ellipsis) |
| Nomor inventaris | `bookCopy.inventoryNumber` (kanan, monospace) |

Baris buku di-ellipsis; bila lebih dari kapasitas kartu → tampilkan sejumlah baris yang muat + baris terakhir `"+N lainnya"` (total tetap dari `totalItems`).

### 3.4 FOOTER — 12 mm
| Elemen | Posisi | Isi |
|---|---|---|
| Jumlah Buku | kiri | "Jumlah: 3" |
| Status Transaksi | tengah-kiri | `DIPINJAM` (hijau) / `SELESAI` (abu) — badge |
| QR Code Transaksi | kanan | SVG `qrcode` nilai = `borrowNumber`, ~10×10 mm |
| Tanda tangan petugas | paling kanan | Garis + `( Setting.librarianName )` |

---

## 4. Penanganan Jumlah Buku Banyak (desain constraint)

Kartu **fixed 60 mm**. Daftar buku tidak bisa memuat >2–3 baris pada 12 mm. Aturan render:
- Tampilkan baris-buku hingga memenuhi tinggi zona;
- Tambah satu baris info `"+N lainnya"` bila ada sisa buku yang tidak muat;
- `Jumlah: N` di footer selalu menampilkan total sebenarnya.

> **Open question untuk PO:** (A) mode "compact" di atas (kartu tetap 60mm) vs (B) kartu **membesar** mengikuti jumlah buku (melanggar ukuran tetap 11×6cm). Direkomendasikan **A** agar ukuran fisik kartu konsisten di semua media.

---

## 5. Mockup HTML (ukuran sebenarnya)

```html
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Kartu Peminjaman</title>
<style>
  @page { size: 110mm 60mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: Arial, 'Segoe UI', sans-serif; color: #1f2937; }
  .borrow-card {
    width: 110mm; height: 60mm; padding: 3mm; display: flex; flex-direction: column;
    border: 1px solid #cbd5e1; border-radius: 2mm; background: #ffffff;
  }
  .header { display: flex; align-items: center; gap: 3mm; height: 14mm; border-bottom: 1px solid #e2e8f0; }
  .logo { width: 10mm; height: 10mm; border: 1px solid #cbd5e1; border-radius: 2mm; display: flex;
          align-items: center; justify-content: center; font-size: 7pt; font-weight: 700; color: #1d4ed8; }
  .lib-name { font-size: 9pt; font-weight: 700; line-height: 1.1; }
  .school-name { font-size: 7pt; color: #475569; }
  .body { display: flex; gap: 3mm; height: 22mm; margin-top: 2mm; }
  .photo { width: 18mm; height: 22mm; border: 1px solid #cbd5e1; border-radius: 1.5mm;
           display: flex; align-items: center; justify-content: center; font-size: 8pt; font-weight: 700; color: #94a3b8; }
  .col { flex: 1; font-size: 6.5pt; }
  .row { display: flex; gap: 2mm; margin-bottom: 1.2mm; }
  .row b { width: 22mm; font-weight: 600; color: #475569; }
  .books { height: 12mm; margin-top: 2mm; border-top: 1px dashed #e2e8f0; padding-top: 1mm; font-size: 6.5pt; overflow: hidden; }
  .book-row { display: flex; justify-content: space-between; gap: 2mm; margin-bottom: 1mm; }
  .book-row .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .book-row .inv { font-family: Consolas, monospace; white-space: nowrap; }
  .more { color: #475569; font-style: italic; }
  .footer { display: flex; align-items: center; gap: 4mm; height: 10mm; margin-top: auto; }
  .footer .left { flex: 1; font-size: 6.5pt; }
  .status { display: inline-block; padding: 0.5mm 2mm; border-radius: 1mm; font-size: 6pt; font-weight: 700; }
  .status.active { background: #dcfce7; color: #166534; }
  .qr { width: 9mm; height: 9mm; }
  .qr svg { width: 100%; height: 100%; }
  .sign { font-size: 6pt; text-align: center; }
  .sign .line { border-top: 1px solid #1f2937; width: 18mm; margin-top: 5mm; }
</style>
</head>
<body>
  <div class="borrow-card">
    <div class="header">
      <div class="logo">LOGO</div>
      <div>
        <div class="lib-name">PERPUSTAKAAN SMP NEGERI 1 TUNAS BANGSA</div>
        <div class="school-name">SMP Negeri 1 Tunas Bangsa</div>
      </div>
    </div>
    <div class="body">
      <div class="photo">BS</div>
      <div class="col">
        <div class="row"><b>Nama</b><span>BUDI SANTOSO</span></div>
        <div class="row"><b>No. Anggota</b><span>S-000123</span></div>
        <div class="row"><b>Jenis</b><span>Siswa</span></div>
        <div class="row"><b>Kelas</b><span>X Merdeka 1</span></div>
      </div>
      <div class="col">
        <div class="row"><b>No. Pinjam</b><span>PJ/202607/0001</span></div>
        <div class="row"><b>Tgl Pinjam</b><span>01-08-2026</span></div>
        <div class="row"><b>Jatuh Tempo</b><span>08-08-2026</span></div>
        <div class="row"><b>Petugas</b><span>Siti Aminah</span></div>
      </div>
    </div>
    <div class="books">
      <div class="book-row"><span class="title">1. Laskar Pelangi</span><span class="inv">INV-000001</span></div>
      <div class="book-row"><span class="title">2. Matematika untuk Kelas X</span><span class="inv">INV-000002</span></div>
      <div class="more">+1 lainnya</div>
    </div>
    <div class="footer">
      <div class="left">Jumlah: 3<br><span class="status active">DIPINJAM</span></div>
      <div class="qr">[SVG QR — nilai: PJ/202607/0001]</div>
      <div class="sign"><div class="line"></div>( Siti Aminah )</div>
    </div>
  </div>
</body>
</html>
```

> Catatan: blok `[SVG QR — nilai: ...]` diisi oleh `generateQrCodeSvg(borrowNumber)` (bcid `qrcode` dari `bwip-js`).

---

## 6. Properti Visual Tambahan (opsional, menunggu keputusan PO)

- **Warna aksen**: biru `#1d4ed8` untuk nama perpustakaan & border; bisa diganti sesuai identitas sekolah.
- **QR**: ukuran 9–10mm, nilai = `borrowNumber` (atau URL detail bila PO mau — perlu keputusan).
- **Tanda tangan**: teks nama petugas + garis; bila PO punya gambar tanda tangan digital → sisipkan sebagai data URI (WO terpisah).

---

## 7. Ringkasan Verifikasi terhadap Spesifikasi PO

| Spesifikasi | Terpenuhi |
|---|---|
| Landscape, 11 cm × 6 cm | ✅ `@page size: 110mm 60mm` + `.borrow-card` fixed |
| Header: Logo, Nama Perpustakaan, Nama Sekolah | ✅ §3.1 |
| Identitas: Foto (kiri), Nama/No/Jenis/Kelas (kanan) | ✅ §3.2 (foto = avatar inisial Phase 1) |
| Transaksi: No. Pinjam, Tgl Pinjam, Jatuh Tempo, Petugas | ✅ §3.2 kanan |
| Daftar buku: Judul + No. Inventaris | ✅ §3.3 |
| Footer: Jumlah, QR, Status, Tanda tangan | ✅ §3.4 |
