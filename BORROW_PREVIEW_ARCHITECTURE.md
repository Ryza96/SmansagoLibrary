# BORROW PREVIEW — ARCHITECTURE (WO-2)

> **Fase:** DISCOVERY / READ ONLY — dokumen desain, TIDAK ada perubahan kode.
> **Status:** MENUNGGU REVIEW PO.
> Dasar: `BORROW_PREVIEW_DISCOVERY.md` + `BORROW_RECEIPT_DESIGN_AMENDMENT.md` (REVISION 5 + FINAL DESIGN DECISION).

---

## 1. Prinsip arsitektur

1. **Single template** — Preview, Cetak, dan Simpan PDF **selalu** memakai satu pemanggilan `generateBorrowCardHtml(data)` di `borrow-card.service.ts`. Renderer TIDAK punya template HTML apa pun.
2. **Main = satu-satunya yang menyentuh DB/Electron** — assembler (`buildBorrowCardData`) membaca data; PrintService hanya meng-orkestrasi fetch → build → template → (print / pdf).
3. **Renderer = thin consumer** — hanya menampilkan string HTML + mentrigger IPC; tanpa business rule (konsisten pola `LabelPreviewPage`).
4. **Aditif, non-breaking** — menambah 3 channel IPC + 1 route + 1 page; TIDAK mengubah schema, migration, repository, `BorrowService`, `BorrowCardService`, atau legacy `printing:borrowReceipt`.

---

## 2. Arsitektur target (paling sederhana)

```
┌────────────────────────── RENDERER ──────────────────────────┐
│ BorrowingsPage                                               │
│   Simpan sukses → navigate(receiptPreviewPath(id))           │
│                                                              │
│ BorrowReceiptPreviewPage.tsx (BARU)                          │
│   mount → api.print.borrowCardPreview(id) → HTML string      │
│   render → <div .preview-sheet scale(var(--zoom))>           │
│   toolbar: Zoom− / % / Zoom+ / Fit / Cetak / Simpan PDF / ×  │
└───────────────┬──────────────────────────┬───────────────────┘
                │ borrowCardPreview        │ borrowCard / borrowCardPdf
┌───────────────▼──────────────────────────▼───────────────────┐
│ ELECTRON MAIN — PrintService (existing, +3 metode)           │
│   getBorrowCardPreviewHtml(id) → string                      │
│   printBorrowCard(id) → printHtml(html, {margins:none})      │
│   saveBorrowCardPdf(id)  → printToPDF + dialog.showSaveDialog│
│   ── shared helper ──                                         │
│   buildBorrowCardHtml(id):                                   │
│     [borrowing, settings] = Promise.all([borrowRepo.findById,│
│                                         settingService.get])│
│     data = buildBorrowCardData(borrowing, settings,          │
│                                {readFileAsDataUri})          │
│     return generateBorrowCardHtml(data)  ← SINGLE TEMPLATE   │
└──────────────────────────────┬───────────────────────────────┘
                               │
                     borrow.repository (existing, tidak diubah:
                     findById include member + details.bookCopy.book)
                     setting.service (existing, tidak diubah)
```

### 2.1 Kenapa PrintService (bukan service baru)

- `PrintService` sudah ter-inject `borrowRepository` + `settingService` (bootstrap.ts:108).
- Pola fetch-berpasangan sudah ada di `printBorrowReceipt` (`Promise.all([findById, get])`).
- Posisi PrintService di `electron/main/` = satu-satunya layer yang boleh memanggil `BrowserWindow`/`dialog` (Electron API). `BorrowCardService` di `src/main/` tetap murni.

---

## 3. Perubahan file

### 3.1 Main (Electron)

| File | Perubahan |
|---|---|
| `electron/main/services/print.service.ts` | **+3 metode** + helper privat: `getBorrowCardPreviewHtml(id)`, `printBorrowCard(id)`, `saveBorrowCardPdf(id)`, `buildBorrowCardHtml(id)`. Import `generateBorrowCardHtml` + `buildBorrowCardData` (dari `borrow-card.service.ts`). |
| `electron/ipc/print.ipc.ts` | **+3 handler**: `printing:borrowCardPreview` → `getBorrowCardPreviewHtml`; `printing:borrowCard` → `printBorrowCard`; `printing:borrowCardPdf` → `saveBorrowCardPdf`. |
| `electron/preload/print.preload.ts` | **+3 method** pada `print`: `borrowCardPreview`, `borrowCard`, `borrowCardPdf`. |
| `electron/main/bootstrap.ts` | **TIDAK diubah** — PrintService sudah di-wire. |

### 3.2 Renderer

| File | Perubahan |
|---|---|
| `src/pages/BorrowReceiptPreviewPage.tsx` | **BARU.** Fetch `api.print.borrowCardPreview(id)` → render; toolbar zoom/fit/cetak/pdf/tutup (detail wireframe). |
| `src/routes/index.tsx` | **+1 route**: `borrowings/:id/receipt-preview` → `<BorrowReceiptPreviewPage />`. |
| `src/utils/navigation.ts` | **+1 helper**: `receiptPreviewPath(id)` → `/borrowings/:id/receipt-preview`; **+1 konstanta** `RECEIPT_PREVIEW` di `ROUTES`. |
| `src/pages/BorrowingsPage.tsx` | **+navigasi**: setelah `create()` sukses → `navigate(receiptPreviewPath(result.id))` (menggantikan/melengkapi kotak hijau CETAK BUKTI). |
| `src/renderer/env.d.ts` | **+3 entry** pada blok `print`. |
| `src/utils/labels.ts` | **+blok `RECEIPT_PREVIEW`** (judul, tombol, status, pesan) mengikuti pola blok `LABEL_PREVIEW`. |

### 3.3 Tidak diubah (bukti constraint)

- `src/main/services/borrow-card.service.ts` — engine WO-1 (dikonsumsi, bukan dimodifikasi).
- `src/main/repositories/borrow.repository.ts`, `schema.prisma`, migration — include sudah lengkap.
- `electron/main/services/borrow*` legacy, `BorrowService`, `BorrowDetailRepository` — out of scope.
- DTO shared — tidak ada DTO renderer baru; kontrak = `borrowingId → string HTML`.

---

## 4. Detail 3 aksi

### 4.1 Preview (read-only, tanpa tulis)

```
renderer → IPC printing:borrowCardPreview(id)
main:    borrowing, settings = Promise.all([findById(id), settingService.get()])
         404 → AppError (pesan "Data peminjaman tidak ditemukan.")
         data = buildBorrowCardData(borrowing, settings, {readFileAsDataUri})
         return generateBorrowCardHtml(data)   // string HTML penuh
renderer: setHtml → render .preview-sheet
```

### 4.2 Cetak

```
renderer → IPC printing:borrowCard(id)
main:    html = buildBorrowCardHtml(id)
         printHtml(html, { margins: { marginType: 'none' } })   // pola printBookLabels
         // @page { size: 110mm 60mm; margin: 0 } sudah ada di template
```

### 4.3 Simpan PDF (jalur baru)

```
renderer → IPC printing:borrowCardPdf(id)
main:    html = buildBorrowCardHtml(id)
         hidden BrowserWindow (show:false, contextIsolation, nodeIntegration:false)
           → loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html))
           → did-finish-load → webContents.printToPDF({pageSize: custom 110x60mm / A4, printBackground:true})
           → dialog.showSaveDialog(parent=focusedWindow, {defaultPath: Kartu_Peminjaman_<borrowNumber>.pdf, filters: PDF})
           → tulis buffer (fs.writeFile)
           → return { saved: true, filePath } | { saved: false } (batal)
```

Catatan D16: path simpan dipilih user via `dialog.showSaveDialog`; renderer menampilkan path saat sukses, tidak menyimpan path di state.

---

## 5. Zoom & Fit (renderer, REVISION 5:169-172)

- `html` dirender dalam `.preview-sheet` yang dibungkus **container berskala**.
- Skala: `transform: scale(var(--zoom))` + `transform-origin: top center`.
- `--zoom` state number (default 1.0). Zoom−/+ → ∓0.1, clamp **[0.5, 2.0]**.
- **100%** → reset `--zoom = 1.0`. Tampilkan persentase aktif (mis. "100%").
- **Fit** → `scale = min(1, (viewportW − 48px) / sheetW)` di mana `sheetW` = lebar kartu terukur (110mm ≈ 416px pada 96dpi); diterapkan langsung ke `--zoom`.
- Tinggi container dihitung ulang (`sheetHeight × zoom`) agar scrollbar benar.
- Multi-halaman: template sudah berisi semua blok `.sheet`; preview menampilkan semuanya dalam satu scroll (bukan tab).
- `busy` men-disable tombol Cetak/PDF selama proses; error → `alert(err.message)`.

---

## 6. Alur lengkap (D1 + D12)

```
BorrowingsPage
  Simpan sukses → setLastSuccessBorrowingId(id) → navigate(receiptPreviewPath(id))
    └─ BorrowReceiptPreviewPage (route borrowings/:id/receipt-preview)
         ├─ loading → HTML tampil (sheet kartu 110×60mm, zoom-able)
         ├─ Cetak      → printing:borrowCard(id)      → webContents.print
         ├─ Simpan PDF → printing:borrowCardPdf(id)   → printToPDF + dialog
         └─ Tutup / ←  → navigate(-1)  (kembali ke Peminjaman)
```

---

## 7. Validasi yang direncanakan (saat fase implementasi, bukan sekarang)

1. `npm run lint` PASS.
2. `npm run build` PASS (main/preload/renderer berubah — ini WO pertama yang me-wire engine).
3. Smoke service-level (fresh DB temp): preview HTML berisi kartu + QR + `@page 110mm 60mm`; print memanggil `printHtml` (spy); PDF menyimpan file + `dialog.showSaveDialog` di-mock; 404 → AppError; `BorrowingsPage` contract via build+grep bundle.
4. `prisma migrate diff` = "No difference detected" (schema tidak disentuh).
5. Grep bundle: `printing:borrowCardPreview/borrowCard/borrowCardPdf` di main, `receipt-preview` di renderer.
