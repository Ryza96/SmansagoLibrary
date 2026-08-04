# BORROW PREVIEW — DESIGN AMENDMENT (WO-2)

> **Fase:** DISCOVERY / DESIGN AMENDMENT — READ ONLY. Tidak ada perubahan kode, tidak ada commit.
> **Status:** MENUNGGU APPROVAL PRODUCT OWNER.
> Basis: `BORROW_PREVIEW_DISCOVERY.md`, `BORROW_PREVIEW_ARCHITECTURE.md`, `BORROW_PREVIEW_WIREFRAME.md` (APPROVED) + 7 revisi desain di bawah.

---

## REVISION 1 — PREVIEW WINDOW: Route vs Fullscreen Modal vs Window terpisah

### 1.1 Perbandingan

| Kriteria | A. Route baru (`/borrowings/:id/receipt-preview`) | B. Fullscreen Modal | C. BrowserWindow preview terpisah |
|---|---|---|---|
| **UX** | Deep-linkable, history back/forward bekerja, reload aman, ikut layout aplikasi | Fokus penuh, tapi tanpa URL → tidak bisa deep-link/reload, state hilang saat refresh | Fokus maksimal, window movable/resizable mandiri |
| **Kompleksitas** | **Rendah** — +1 route +1 page (pola `LabelPreviewPage`) | Sedang — modal + overlay + state di halaman inang | **Tinggi** — lifecycle window, IPC kedua, preload, theme terpisah |
| **Maintenance** | **Rendah** — pola yang sama dengan label preview | Sedang — modal melekat ke halaman inang | **Tinggi** — satu "permukaan" baru yang harus dirawat (focus/close/minimize) |
| **Reuse** | **Tinggi** — mudah dipanggil dari mana saja (riwayat, detail anggota, dll) | Rendah — hanya dari halaman inang | Rendah — bespoke window |
| **Konsistensi** | **Tinggi** — cermin `books/:id/labels-preview` yang sudah disetujui PO | Rendah — tidak ada preseden fullscreen modal di aplikasi (modal existing = `InlineAddModal`, `ClassCloneModal` = dialog kecil) | Rendah — tidak konsisten dengan chrome aplikasi |
| **Fokus operator** | Sedang — TopBar/Sidebar tetap terlihat | Tinggi — menutup chrome | **Tertinggi** |

### 1.2 Rekomendasi final: **OPTION A — Route baru**

Alasan:
1. **Pola sudah disetujui & terbukti** — `LabelPreviewPage` adalah preseden persis (route + page + `api.print.getLabelPreviewHtml`). Menambah route lain = nol keputusan arsitektur baru.
2. **Kompleksitas & maintenance terendah** — tidak menyentuh window lifecycle, tidak perlu IPC tambahan antar-window, tidak perlu duplikasi theme.
3. **Deep-link & history** — operator dapat kembali (`←`/Tutup = `navigate(-1)`), refresh tidak kehilangan konteks.
4. **Reuse** — jalur yang sama nanti dapat dipakai dari Riwayat Peminjaman/Detail Anggota tanpa biaya.
5. **Kekurangan fokus (Sidebar terlihat) dapat dimitigasi ringan** — header halaman sudah memakai "Pratinjau" sebagai mode fokus; tidak cukup penting untuk menambah kompleksitas B/C.

> Catatan: Opsi C paling "fokus" tapi biayanya tidak sebanding; Opsi B tidak konsisten dengan pola aplikasi. Jika kelak PO ingin mode presentasi penuh, itu dapat menjadi WO terpisah — bukan WO-2.

---

## REVISION 2 — FIT: Fit Width vs Fit Page

### 2.1 Analisis

| | Fit Width | Fit Page |
|---|---|---|
| Formula | `scale = min(1, (viewportW − pad) / sheetW)` | `scale = min(1, (viewportW − pad)/sheetW, (viewportH − pad)/sheetH)` |
| Efek | Semua sheet selebar viewport; antar-sheet scroll vertikal | Seluruh kartu tampil utuh (lebar+tinggi) dalam satu pandangan |
| Skala readable | **Maksimal** (kartu 110mm → hampir selalu ≥ 80%) | Kecil — kartu landscape 110×60mm di-zoom keluar (letterbox vertikal besar) |
| Multi-sheet | Cocok — scroll vertikal alami antar sheet | Tetap perlu scroll vertikal (halaman 2+ tetap harus di-scroll) |
| WYSIWYG cetak | Lebar sheet = lebar cetak (110mm) → presisi | Lebar tampilan < lebar cetak → kurang presisi |
| Kapan berguna | **Hampir selalu** untuk dokumen kartu | Hanya untuk "sekali lihat utuh" satu halaman |

### 2.2 Kesimpulan: **keduanya TIDAK perlu — cukup satu kontrol "Fit Width"**

- Rasio kartu = 110:60 ≈ **1,83:1 (landscape lebar-pendek)**. Di area preview yang umumnya tinggi, **Fit Width memberi skala terbesar yang masih terbaca** dan sudah "hampir Fit Page" secara visual (tinggi kartu kecil).
- Fit Page justru **memperkecil** tampilan (dibatasi dimensi terkecil = tinggi 60mm) tanpa manfaat — dan multi-sheet tetap butuh scroll.
- Dua tombol yang melakukan hal mirip = kebingungan operator (pertanyaan "mana yang harus saya pakai?").
- **Keputusan:** toolbar memuat tombol **"Fit Width"** (bukan "Fit"). Tidak ada "Fit Page".

---

## REVISION 3 — ZOOM: Dukungan CTRL + Mouse Wheel

### 3.1 Layak? **YA — layak didukung.**

- Ini **konvensi desktop universal** (browser: Ctrl+Wheel, Ctrl+Plus/Minus) — operator meminjam dari muscle-memory; biaya implementasi rendah.
- **Peringatan penting:** Chromium secara native membungkus Ctrl+Wheel sebagai *page zoom* (zoom layout seluruh halaman). Itu **BUKAN** zoom `transform` kita dan akan merusak render `.preview-sheet`. Karena itu handler harus **mencegat (intercept)** event sebelum Chromium memprosesnya.

### 3.2 Implementasi

```tsx
// di BorrowReceiptPreviewPage — useEffect mount, ref scrollContainer
useEffect(() => {
  const el = scrollRef.current
  if (!el) return
  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey) return
    e.preventDefault()                 // cegah page-zoom native Chromium
    const step = e.deltaY > 0 ? -0.1 : 0.1
    setZoom((z) => clamp(z + step, 0.5, 2.0))   // clamp 50%–200%
  }
  el.addEventListener('wheel', onWheel, { passive: false })  // non-passive!
  return () => el.removeEventListener('wheel', onWheel)
}, [])
```

Detail wajib:
1. **`{ passive: false }`** — tanpanya `preventDefault()` ditolak browser (wheel dianggap passive). React `onWheel` sintetik tidak menjamin ini → pakai `addEventListener` native pada ref container.
2. **`e.preventDefault()` sebelum `setZoom`** — kunci agar Chromium tidak memicu page-zoom bawaan.
3. **Pemetaan deltaY** — satu notch roda ≈ ±0.1 (sama dengan langkah tombol Zoom±) sehingga tombol & wheel konsisten; klik-tengah/delta halus dipetakan linier.
4. **Clamp 0.5–2.0** konsisten dengan tombol Zoom±; indikator % di toolbar diperbarui live.
5. Tidak perlu `Ctrl +` / `Ctrl −` keyboard (out of scope WO-2) — dapat menjadi aditif jika diinginkan.

---

## REVISION 4 — SAVE PDF: Format nama file

### 4.1 Kriteria evaluasi

| Kriteria | Keterangan |
|---|---|
| Aman di filesystem Windows | Tanpa `<>:"/\|?*` + control char; tanpa titik di akhir |
| Unik & sortable | Nomor pinjam sudah unik → basis utama |
| Human-readable | Operator langsung tahu isi file |
| Tidak terlalu panjang | Hindari path-length issue Windows (~260 char) |
| Deterministik | Nama sama untuk transaksi sama (repeat save = overwrite prompt, bukan duplikasi) |

### 4.2 Alternatif

| Format | Aman FS | Unik | Baca | Panjang | Penilaian |
|---|---|---|---|---|---|
| `Kartu Peminjaman - PJ-000123 - Nama Anggota.pdf` (usulan user) | ✓ | ✓ | ✓✓ | Sedang | **Rekomendasi** |
| `Kartu Peminjaman - Nama Anggota - PJ-000123.pdf` | ✓ | ✓ | ✓✓ | Sedang | Nama duluan → sorting kurang rapi (grouping per anggota) |
| `Kartu Peminjaman - PJ-000123 - Nama - 20260805.pdf` | ✓ | ✓ | ✓ | Lebih panjang | Tanggal menambah unik tapi menumpuk duplikasi; berlebihan |
| `Kartu_Peminjaman_PJ-000123_Nama.pdf` (underscore) | ✓ | ✓ | ✓ | Sedang | Kurang terbaca (underscore bukan spasi) |
| `PJ-000123 - Nama Anggota.pdf` (tanpa prefix) | ✓ | ✓ | ✓ | Pendek | Kurang jelas jenis dokumen |
| `Kartu Peminjaman - PJ-000123.pdf` (tanpa nama) | ✓ | ✓ | ✓ | Pendek | Kehilangan konteks anggota di list file |

### 4.3 Rekomendasi final

**`Kartu Peminjaman - PJ-000123 - Nama Anggota.pdf`**

Urutan alasan:
1. **Prefix dokumen** → operator langsung mengenali jenis file di folder.
2. **Nomor pinjam di tengah** → unik + sortable (berurutan kronologis); menempati posisi stabil.
3. **Nama anggota di akhir** → konteks manusiawi; mudah di-truncate bila panjang.
4. **Tanpa tanggal** → nomor pinjam sudah unik; menambah tanggal hanya menumpuk duplikat pada repeat-save.
5. **Separator `" - "`** → aman Windows, terbaca.

Aturan sanitasi (dijalankan di **main**, bukan renderer):
- Hapus karakter ilegal Windows `<>:"/\|?*` + control char dari nama anggota.
- Truncate nama anggota ≈ **40 karakter** (fallback `borrowing.member.fullName ?? borrowing.memberName ?? 'Anggota'`).
- Collapse spasi ganda → satu; trim.
- Fallback bila hasil kosong → `Kartu Peminjaman`.
- Nama dibangun di `PrintService.saveBorrowCardPdf` → `defaultPath` `dialog.showSaveDialog`; user tetap bisa mengedit.

---

## REVISION 5 — PRINT: Dialog printer bawaan vs preview printer tambahan

### 5.1 Analisis

| | Dialog printer bawaan (`webContents.print`) | Preview printer tambahan (custom print preview) |
|---|---|---|
| Deskripsi | Membuka **system print dialog** OS (pilih printer, salinan, duplex, dll) — non-silent | UI tambahan untuk "lihat hasil sebelum kirim ke printer" |
| Kelebihan | • Nol effort — terintegrasi OS & driver printer<br>• Konsisten dengan perilaku semua app desktop<br>• Ukuran kartu dipastikan `@page 110mm 60mm` | • WYSIWYG cek sebelum kirim |
| Kekurangan | Tidak menampilkan pratinjau halaman custom di aplikasi kita | • **Redundan** — halaman preview WO-2 SUDAH WYSIWYG (HTML identik dgn print)<br>• Scope besar (≈ membuat window preview kedua)<br>• Konflik konseptual dgn "single template" |
| Risiko | Rendah — jalur sudah dipakai `printBookLabels`/`printBorrowReceipt` | Tinggi — scope creep |

### 5.2 Rekomendasi final: **CUKUP dialog printer bawaan Electron**

1. `webContents.print({ margins:{marginType:'none'}, printBackground:true })` (non-silent) → **system print dialog** Windows. Nol biaya, dukungan driver penuh.
2. Preview aplikasi kita **adalah** preview printer: HTML yang dirender = HTML yang dicetak (single template). Menambah preview printer lain = menggandakan fungsi.
3. Untuk operator yang ingin "memastikan hasil persis", jalur **Simpan PDF** berfungsi sebagai verifikasi output sebelum cetak fisik.

---

## REVISION 6 — SETELAH CETAK: Preview tidak boleh auto-tutup

### 6.1 Analisis UX

| Opsi | Perilaku | Penilaian |
|---|---|---|
| a. **Tetap di preview, tanpa navigasi** | Setelah dialog print selesai → `busy` di-reset, semua tombol aktif kembali; halaman tetap | **Rekomendasi** |
| b. Tetap + konfirmasi inline transien | Tambah teks singkat "Pencetakan selesai" di dekat toolbar | Opsional; app tidak punya infra toast — teks inline sederhana |
| c. Auto-close/navigate | Preview tertutup otomatis | **DITOLAK** (persyaratan) |

### 6.2 Rekomendasi final

- **Tetap di preview.** Tidak ada `navigate`, tidak ada `window.close`.
- `busy` → reset; tombol Cetak/Simpan PDF aktif kembali → operator bebas memilih aksi berikutnya (cetak ulang, simpan PDF, tutup).
- Sukses = **diam** (kesuksesan sudah terlihat dari dialog printer yang selesai); error → `alert(err.message)` (pola existing).
- Perilaku ini **identik dengan `LabelPreviewPage`** (tetap terbuka setelah Cetak) → konsisten.

---

## REVISION 7 — MULTI PAGE: Indikator halaman

### 7.1 Analisis opsi

| Opsi | Perilaku | Penilaian |
|---|---|---|
| a. **Chip "Halaman 1 / 3" di toolbar** + prev/next chevron | Chip sinkron dengan sheet yang terlihat (IntersectionObserver); prev/next → `scrollIntoView` sheet tetangga; hanya tampil bila > 1 sheet | **Rekomendasi** |
| b. Page dots (titik per halaman) | Kurang presisi untuk >3 halaman; boros ruang | Tidak |
| c. Label "Halaman 1 dari 3" dicetak di tiap sheet (di template) | Informatif di hasil cetak | **DITOLAK** — memodifikasi `borrow-card.service.ts` (constraint WO-2: engine dikonsumsi, bukan dimodifikasi) |
| d. Tanpa indikator | — | Tidak memenuhi kebutuhan |

### 7.2 Rekomendasi final

**Chip "Halaman 1 / 3" di toolbar, renderer-side, tanpa menyentuh template:**

- **Deteksi sheet aktif:** `IntersectionObserver` pada `.sheet` di dalam `.preview-sheet`; sheet dengan irisan tertinggi di area pandang → `activePage = index + 1`. Total = jumlah node `.sheet`.
- **Tampil hanya bila `total > 1`** (satu halaman → chip disembunyikan, ruang toolbar bersih).
- **Prev / Next chevron** (tampil hanya bila `total > 1`): `scrollIntoView({behavior:'smooth'})` ke sheet `activePage−1` / `+1`.
- **Tidak mengubah template** — `.sheet` sudah dihasilkan `generateBorrowCardHtml`; renderer cukup query DOM.
- Format label: **`Halaman 1 / 3`** (lebih eksplisit daripada `1 / 3`; ringkas, tidak ambigu).
- Dengan Fit Width + multi-sheet, seluruh sheet hampir selalu terlihat — chip tetap berguna sebagai penunjuk posisi dan total.

---

## FINAL PREVIEW DESIGN DECISION

Merangkum seluruh keputusan yang menjadi **dasar implementasi WO-2** (setelah approval PO).

| # | Keputusan | Nilai |
|---|---|---|
| **F1** | Preview window | **Route baru** `/borrowings/:id/receipt-preview` → `BorrowReceiptPreviewPage.tsx` (pola `LabelPreviewPage`) |
| **F2** | Kontrol zoom | Tombol **Zoom − / % / Zoom +** (`transform: scale(var(--zoom))`, `transform-origin: top center`, **clamp 50%–200%**, ±10% per langkah) |
| **F3** | Fit | **Satu** tombol **"Fit Width"** (`min(1, (viewportW − 48px)/sheetW)`); **tidak ada** Fit Page |
| **F4** | Zoom wheel | **Dukung CTRL + Mouse Wheel**; intercept via `addEventListener('wheel', handler, {passive:false})` + `preventDefault()` (cegah page-zoom native Chromium); langkah ±0.1/notch; clamp sama |
| **F5** | Simpan PDF | `api.print.borrowCardPdf(id)` → `printToPDF` (ukuran dari `@page 110mm 60mm`) + `dialog.showSaveDialog`; nama default **`Kartu Peminjaman - <borrowNumber> - <Nama Anggota>.pdf`** (sanitasi + truncate 40 char di main) |
| **F6** | Cetak | **System print dialog** bawaan Electron (`webContents.print` non-silent, `margins:none`, `printBackground:true`); **tanpa** preview printer tambahan (preview = WYSIWYG) |
| **F7** | Setelah Cetak | **Preview tetap terbuka**, tidak auto-close; `busy` di-reset; sukses diam, error `alert` |
| **F8** | Multi-page | Chip **"Halaman 1 / 3"** di toolbar + prev/next chevron (hanya bila `total > 1`); IntersectionObserver renderer-side; **tanpa** mengubah template |
| **F9** | Tutup | Tombol `←` dan **Tutup** → `navigate(-1)` kembali ke halaman Peminjaman |
| **F10** | Entry point | `BorrowingsPage`: setelah `create()` sukses → `navigate(receiptPreviewPath(id))`; kotak hijau "CETAK BUKTI" legacy tetap dipertahankan |
| **F11** | Plumbing | **3 channel IPC baru** (`printing:borrowCardPreview`, `printing:borrowCard`, `printing:borrowCardPdf`) + preload + env.d.ts; `PrintService` +3 metode (reuse `borrowRepository`+`settingService` ter-inject); **single template** `generateBorrowCardHtml` untuk preview/print/pdf |
| **F12** | Tidak diubah | `borrow-card.service.ts`, schema, migration, repository, `BorrowService`, legacy `printing:borrowReceipt`; renderer **tanpa business rule** |
| **F13** | Constraint | READ ONLY s/d approval; lint + build + smoke (fresh DB temp) + `prisma migrate diff` saat fase implementasi |
