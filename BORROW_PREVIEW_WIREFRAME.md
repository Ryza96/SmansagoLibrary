# BORROW PREVIEW — WIREFRAME (WO-2)

> **Fase:** DISCOVERY / READ ONLY — dokumen desain, TIDAK ada perubahan kode.
> **Status:** MENUNGGU REVIEW PO.
> Dasar: `BORROW_RECEIPT_DESIGN_AMENDMENT.md` REVISION 5 (wireframe toolbar) + `BORROW_PREVIEW_ARCHITECTURE.md`.

---

## 1. Wireframe — jendela preview (route `borrowings/:id/receipt-preview`)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ←  Pratinjau Kartu Peminjaman              PJ/202607/0001                  │
│                                                                            │
│  [Zoom −]  [ 100% ]  [Zoom +]  [ Fit ]  [ Cetak ]  [ Simpan PDF ]  [ Tutup]│
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│                          ┌────────────────────────────┐                    │
│                          │ ┌────────────────────────┐ │                    │
│                          │ │  KARTU PEMINJAMAN       │ │   ← sheet 1       │
│                          │ │  110mm × 60mm           │ │      (utama)      │
│                          │ │  logo · identitas ·     │ │      discale      │
│                          │ │  buku · QR · tanda      │ │                   │
│                          │ └────────────────────────┘ │                    │
│                          │ ┌────────────────────────┐ │                    │
│                          │ │  LANJUTAN · buku sisa   │ │   ← sheet 2       │
│                          │ └────────────────────────┘ │                    │
│                          └────────────────────────────┘                    │
│                          area scroll bebas (vertikal)                       │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Baris judul:** tombol kembali `←` (sama fungsinya dengan Tutup) + judul "Pratinjau Kartu Peminjaman" + nomor pinjam (`PJ/202607/0001`) sebagai info konteks.
- **Toolbar:** 7 kontrol (detail §2).
- **Area preview:** container berskala (`transform: scale(var(--zoom))`) berisi semua blok `.sheet` dari template — satu scroll vertikal, **bukan** tab per halaman (REVISION 5:172).
- **Footer state:** area loading / pesan error (merah) / "Tidak ada data".

---

## 2. Toolbar — kontrol & perilaku (spesifikasi REVISION 5:158-173)

| # | Kontrol | Perilaku | Keterangan |
|---|---|---|---|
| 1 | **Zoom −** | `--zoom -= 0.1`, clamp bawah **50%** | `∓10%` per klik |
| 2 | **% (mis. "100%")** | Label persentase aktif; klik → reset `--zoom = 1.0` | Menampilkan nilai saat ini (dibulatkan integer) |
| 3 | **Zoom +** | `--zoom += 0.1`, clamp atas **200%** | `∓10%` per klik |
| 4 | **Fit** | `scale = min(1, (viewportW − 48px) / sheetW)` → set `--zoom` | `sheetW` = lebar kartu terukur (110mm) |
| 5 | **Cetak** | `api.print.borrowCard(id)` → hidden window `webContents.print`, `pageSize 110×60mm` | HTML identik dgn preview (single template) |
| 6 | **Simpan PDF** | `api.print.borrowCardPdf(id)` → `printToPDF` + `dialog.showSaveDialog` | Tampilkan path tersimpan saat sukses |
| 7 | **Tutup** | `navigate(-1)` kembali ke halaman Peminjaman | Di-cover juga oleh tombol `←` |

### State & edge behavior

- **`busy`** (sedang proses Cetak/PDF): tombol **Cetak** dan **Simpan PDF** `disabled` + teks berubah ("Mencetak…"/"Menyimpan…") — pola `LabelPreviewPage` `printing` state.
- **Error** (404 / gagal load / gagal print): `alert(err.message)` (pola `BookDetail` decommission); loading error → teks merah di area preview.
- **Batal Simpan PDF** (user membatalkan dialog): tidak ada error — tidak ada pesan, preview tetap.
- **Zoom clamp**: 50%–200%; Fit dapat menghasilkan < 50% secara alami? → **dibatasi `max(0.5, …)`** agar tetap dalam rentang (konsisten REVISION 5 "Fit (min. 50%)").

---

## 3. Struktur komponen (renderer, proposal)

```
BorrowReceiptPreviewPage.tsx
├─ state : html | zoom (default 1) | loading | error | busyPdf | busyPrint
├─ ref   : scrollContainer (untuk Fit & ukuran sheet)
├─ mount : api.print.borrowCardPreview(id) → setHtml
├─ toolbar
│   ├─ Zoom− / % / Zoom+ / Fit          (mengubah --zoom)
│   ├─ Cetak      → api.print.borrowCard(id)
│   ├─ Simpan PDF → api.print.borrowCardPdf(id) → alert(path)
│   └─ Tutup      → navigate(-1)
└─ area   : <div style={{--zoom, width: sheetW*zoom, height: sheetH*zoom}}>
              <div className="preview-sheet overflow-auto"
                   dangerouslySetInnerHTML={{__html: html}} />
            </div>
```

Perilaku:
- `.preview-sheet` persis pola `LabelPreviewPage.tsx:103` (kelas polos + `overflow-auto`).
- Tinggi container = `sheetH × zoom` agar scrollbar benar (REVISION 5:171).
- Tidak ada business rule di renderer — seluruh data/SVG/logika di `borrow-card.service.ts`.

---

## 4. Alur navigasi & integrasi

```
BorrowingsPage
  ├─ create() sukses → setLastSuccessBorrowingId(result.id)
  │                    └─ navigate(receiptPreviewPath(result.id))   ← D12
  │
  └─ (opsional, tetap dipertahankan) kotak hijau "Transaksi berhasil disimpan!"
      + tombol "CETAK BUKTI" legacy → printing:borrowReceipt
      (keputusan implementasi: apakah kotak hijau dialihkan ke tombol
       "LIHAT KARTU"/otomatis navigate — pilihan PO, bukan scope discovery)

BorrowReceiptPreviewPage (route borrowings/:id/receipt-preview)
  ├─ ← / Tutup → navigate(-1) → kembali ke BorrowingsPage
  └─ Cetak / Simpan PDF → main (single template)
```

Catatan scope: **TIDAK** menambah route cetak terpisah; preview = satu-satunya pintu menuju Cetak dan Simpan PDF.

---

## 5. Ukuran sheet & math (referensi implementasi)

| Item | Nilai | Asal |
|---|---|---|
| Ukuran kartu | 110mm × 60mm | `BORROW_CARD_LAYOUT` (borrow-card.service.ts:19-26) |
| `@page` template | `110mm 60mm; margin:0` | `generateBorrowCardHtml` (borrow-card.service.ts:228) |
| `sheetW` acuan Fit | lebar kartu dalam px (110mm ≈ 416px @96dpi) — diukur dari DOM `sheet` pertama saat mount | REVISION 5:164,172 |
| Rentang zoom | 50%–200% | REVISION 5:162 |
| Zoom per klik | ±10% | REVISION 5:162 |
| Multi-sheet | 1 scroll vertikal, semua `.sheet` tampil | REVISION 5:172 |
