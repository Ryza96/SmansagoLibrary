# LABEL_LAYOUT_FINAL_DESIGN.md — Desain Final Label Buku (A4 3×4, 12 Label)

**Tanggal:** 01 Agustus 2026
**Mode:** READ ONLY — desain saja. **TIDAK ada CSS/HTML/kode yang ditulis.**
**Keputusan PO (FINAL):** Kertas A4 · 3 kolom × 4 baris · **12 label per halaman**.

---

## 0. Geometri Dasar (Perhitungan)

**Kertas A4:** 210mm × 297mm

| Dimensi | Perhitungan | Hasil |
|---------|-------------|-------|
| Lebar label | 210mm ÷ 3 | **70mm** |
| Tinggi label | 297mm ÷ 4 | **74.25mm** |
| Lebar area konten | 70mm − (2 × 4mm padding) | **62mm** |
| Tinggi area konten | 74.25mm − (2 × 4mm padding) | **66.25mm** |

Desain ini memakai **margin halaman 0mm** — label menumpuk penuh tanpa celah; **border putus-putus label berfungsi sebagai garis potong** (paradigma "label sheet"). Angka 70mm/74.25mm adalah hasil bagi pas sehingga **tidak ada sisa ruang terbuang**.

---

## 1. Mockup — Satu Label (70mm × 74.25mm)

```
┌──────────────────────────────────────────────┐  ← border putus-putus (garis potong)
│    S M A N   S A M A R I N D A — P E R P U S   │  ← ① HEADER · Nama Perpustakaan (9%)
│                                              │
│    ┌────────────────────────────────────┐    │
│    │ █ ███ ██ █ ███ ██ ██ █ ██ ██ ██    │    │
│    │ █ ███ ██ █ ███ ██ ██ █ ██ ██ ██    │    │
│    │ █ ███ ██ █ ███ ██ ██ █ ██ ██ ██    │    │
│    │ █ ███ ██ █ ███ ██ ██ █ ██ ██ ██    │    │  ← ② BARCODE Code128 (56%)
│    │ █ ███ ██ █ ███ ██ ██ █ ██ ██ ██    │    │
│    │ █ ███ ██ █ ███ ██ ██ █ ██ ██ ██    │    │
│    │ █ ███ ██ █ ███ ██ ██ █ ██ ██ ██    │    │
│    │  1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6   │    │
│    └────────────────────────────────────┘    │
│                                              │
│               INV-000001                     │  ← ③ NOMOR INVENTARIS (9%)
│                                              │
│    Bumi Manusia — Pramoedya Ananta Toer      │  ← ④ JUDUL BUKU (14%, maks. 2 baris)
│                                              │
│                RAK A - 01                    │  ← ⑤ LOKASI RAK (8%)
│                                              │
└──────────────────────────────────────────────┘
```

**Urutan top-to-bottom (FINAL):** ① Nama Perpustakaan → ② Barcode Code128 (+ nomor di bawah bar) → ③ Nomor Inventaris → ④ Judul Buku → ⑤ Lokasi Rak.

---

## 2. Mockup — Satu Halaman A4 (12 Label)

```
┌──────────────────────────────────────────────────────────────┐
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │ ① Header       │  │ ① Header       │  │ ① Header       │   │
│  │ ② Barcode      │  │ ② Barcode      │  │ ② Barcode      │   │
│  │ ③ Inventaris   │  │ ③ Inventaris   │  │ ③ Inventaris   │   │
│  │ ④ Judul        │  │ ④ Judul        │  │ ④ Judul        │   │
│  │ ⑤ Rak          │  │ ⑤ Rak          │  │ ⑤ Rak          │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │ Label 04       │  │ Label 05       │  │ Label 06       │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │ Label 07       │  │ Label 08       │  │ Label 09       │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │ Label 10       │  │ Label 11       │  │ Label 12       │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
└──────────────────────────────────────────────────────────────┘

   Aliran isi = kiri → kanan, atas → bawah (row-major).
   Baris 1 = label 1-3, baris 2 = label 4-6, dst.
   Setiap label = 70mm × 74.25mm, total 3×70 = 210mm dan 4×74.25 = 297mm = pas.
```

---

## 3. Proporsi Layout (Dari Tinggi Area Konten 66.25mm)

| Zona | Tinggi | Proporsi | Isi |
|------|--------|----------|-----|
| ① Header | 6.0mm | **9%** | Nama Perpustakaan |
| *gap* | 0.7mm | — | jarak antar zona |
| ② Barcode | 37.0mm | **56%** | Code128 (bar ~33mm) + teks terbaca (human-readable) |
| *gap* | 0.7mm | — | |
| ③ Inventaris | 6.0mm | **9%** | `INV-000001` |
| *gap* | 0.7mm | — | |
| ④ Judul | 9.5mm | **14%** | Judul, maks. 2 baris (clamp) |
| *gap* | 0.7mm | — | |
| ⑤ Lokasi Rak | 5.0mm | **8%** | `RAK A - 01` |
| *gap* | 0.7mm | — | |
| **Total** | **66.25mm** | **100%** | |

**Distribusi visual:** barcode menguasai lebih dari separuh tinggi label (56%) — ia adalah elemen operasional utama. Kombinasi Header + Inventaris + Judul + Rak (40%) berfungsi sebagai informasi pembaca manusia yang kompak.

---

## 4. Typography (Rekomendasi)

| Zona | Font | Ukuran | Berat | Warna | Keterangan |
|------|------|--------|-------|-------|------------|
| ① Nama Perpustakaan | Arial | **10px** | Bold (700) | `#1f2937` | UPPERCASE, letter-spacing 0.5px |
| ② Barcode human-readable | bwip-js | 9px | — | `#1f2937` | `includetext:true`, `textxalign:center` |
| ③ Nomor Inventaris | Consolas / monospace | **13px** | Bold (700) | `#111827` | letter-spacing 1px (paling terbaca) |
| ④ Judul Buku | Arial | **10.5px** | Regular (400) | `#1f2937` | line-height 1.3, 2-baris clamp |
| ⑤ Lokasi Rak | Arial | **10px** | Semi-bold (600) | `#475569` | grey, menonjol sedang |

**Hierarki tipografi (terkuat → terlemah):** Nomor Inventaris (13px bold mono) > Barcode human-readable (elemen grafis) > Judul > Nama Perpustakaan = Lokasi Rak.

---

## 5. Spacing & Border

| Item | Nilai | Alasan |
|------|-------|--------|
| Margin halaman | **0mm** | Label menumpuk penuh; border jadi garis potong |
| Padding label | **4mm horizontal, 4mm vertikal** | Amannya konten dari area potong |
| Gap antar zona | 0.7mm | Pemisah visual tanpa membuang ruang |
| Tinggi barcode (bar) | **33mm** + teks | Skannable dari jarak & sudut miring |
| Border label | **1px dashed, `#94a3b8`** | Garis potong yang jelas namun tidak dominan |
| Border-radius | 0 | Sudut siku memudahkan potong presisi |

---

## 6. Rationale — Alasan Setiap Keputusan

**Mengapa barcode paling besar (56%)?**
Barcode adalah satu-satunya elemen yang di-scan oleh mesin. Semakin besar area bar, semakin andal pembacaan pada jarak miring/berjauhan, toleran terhadap cetakan kusam/kotor, dan tidak menuntut penempatan yang presisi saat scan. Kegagalan scan = hambatan operasional terbesar, jadi elemen ini mendapat prioritas ruang tertinggi.

**Mengapa Nomor Inventaris di bawah barcode (bukan di atas)?**
Barcode dan nomor inventaris adalah pasangan verifikasi: petugas menscan barcode lalu mencocokkan nomor terbaca secara visual. Menempatkan keduanya berdekatan dan kontigu (tanpa zona lain di antara) membuat verifikasi cepat — mata bergerak 0 detik antara bar dan nomor. Urutan ini juga menegaskan "yang di-scan = yang tertulis di bawahnya".

**Mengapa Nama Perpustakaan di paling atas?**
Header adalah identitas institusi yang harus terlihat pertama kali saat label menempel pada buku atau saat inspeksi rak. Posisi paling atas memberinya bidang yang bebas dari gangguan grafis barcode, dan menciptakan pola "sumber → identitas → konteks" yang natural bagi pembaca.

**Mengapa Judul berada di bawah nomor inventaris?**
Judul adalah informasi kontekstual, bukan operasional. Setelah scan + verifikasi nomor, petugas membaca judul hanya jika perlu (mis. saat menyusun ulang atau mengaudit). Menaruhnya di zona bawah mencegahnya bersaing dengan area barcode; karena bisa di-truncate (2 baris) tanpa merusak fungsi, posisinya sengaja lebih rendah dalam hierarki.

**Mengapa Lokasi Rak di bagian paling bawah?**
Lokasi rak (shelfmark) dipakai saat *menempatkan kembali* buku, bukan saat meminjam. Saat buku dipegang tegak di rak, area terbawah yang paling mudah dibaca tanpa memutar buku. Memisahkannya di footer juga membuatnya mudah dipindai cepat dengan jari saat petugas berjalan menyusuri rak.

**Mengapa margin 0 + border dashed?**
Keputusan PO "12 label per halaman" tercapai optimal (3×70=210, 4×74.25=297 — nol sisa). Border putus-putus berfungsi ganda: sebagai batas visual antar label dan sebagai garis potong. Ini paradigma standar kertas label komersial (Avery-style).

**Mengapa inventaris paling tebal (13px bold mono)?**
Nomor inventaris adalah identitas unik buku. Font monospace membuat digit tak ambigu (0 vs O, 1 vs l) dan tebal memastikan terbaca meski label kecil; angka adalah konten yang paling sering diverifikasi setelah scan.

**Mengapa judul dibatasi 2 baris?**
Judul panjang (mis. 60+ karakter) tidak mungkin muat pada 62mm; truncate 2-baris menjaga konsistensi tinggi baris label sehingga grid 12/halaman tidak bergeser. Konten penuh tetap tersedia di sistem, label cukup untuk identifikasi.

**Mengapa rak memakai warna abu (bukan hitam)?**
Lokasi rak bukan identitas permanen buku — bisa berubah saat penataan ulang. Warna abu memberi sinyal "informasi dinamis", membedakannya dari inventaris (hitam, permanen). Ini membantu staf membedakan kedua angka secara intuitif.

---

## 7. Ringkasan Desain (Spesifikasi 1 Baris)

> A4 · margin 0 · label 70mm×74.25mm · padding 4mm · urutan [Header 9% → Barcode 56% → Inventaris 9% → Judul 14% → Rak 8%] · barcode Code128 setinggi 33mm · inventaris 13px bold mono · judul 10.5px/2-baris · rak 10px abu · border 1px dashed abu.

---

## 8. Catatan Risiko (dari Audit Sebelumnya — Untuk Tahap Implementasi)

| Risiko | Dampak pada Desain |
|--------|--------------------|
| Margin 0 → area non-cetak printer fisik | Bila printer target memotong tepi, fallback: margin halaman 6mm + gap 2mm antar label → label 63.3mm × 68.75mm (tetap 3×4). **Wajib uji fisik printer sebelum rilis.** |
| Barcode tanpa escaping | Desain memakai nilai barcode = `INV-...` (aman); validasi charset tetap direkomendasikan saat implementasi. |
| Judul `-webkit-line-clamp: 2` | CSS akan menambahkan `padding: 0 6px` untuk mencegah huruf terpotong di tepi label. |

**Status: DESAIN FINAL SIAP — READ ONLY, tidak ada kode/commit/staging. BERHENTI, menunggu instruksi implementasi dari Product Owner.**
