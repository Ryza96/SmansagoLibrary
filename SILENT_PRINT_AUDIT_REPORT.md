# Audit Silent Print Kartu Peminjaman (A6) — LAPORAN LENGKAP

## 1. Ringkasan Eksekutif

Bug dilaporkan: **Silent print Kartu Peminjaman gagal** — muncul "Print job canceled" dan/atau hasil fisik keluar **A4** padahal kartu didesain **A6 (105×148mm)**.

Audit 3 langkah selesai. Hasil: **bukan bug tunggal pada satu baris kode**, melainkan kombinasi:
1. **User belum memilih printer** di Settings → `borrowCardPrinter = ''` (verified DB live) → `deviceName` tidak dikirim.
2. `silent:true` + `deviceName` kosong → Electron mencetak ke **printer default sistem**.
3. Di Electron 33.4.11, custom `pageSize` (105000×148000 µm) **tidak di-respect dengan andal pada jalur silent** (bug upstream #26982; fix PR #50808 baru tersedia di Electron ≥41) → driver/spooler menerima ukuran tak dikenal → **job ditolak** atau **substitusi A4**.

Rekomendasi utama: wajib pilih printer di Settings (isi `borrowCardPrinter`), dan perbaiki jalur silent agar meneruskan `deviceName` + pageSize secara konsisten; verifikasi custom A6 di driver.

## 2. Gejala

| # | Gejala | Kemungkinan penyebab |
|---|--------|----------------------|
| G1 | "Print job canceled" (callback `failureReason`) | `silent:true` + custom pageSize ditolak driver/spooler |
| G2 | Hasil fisik A4 bukan A6 | Custom pageSize diabaikan (Electron 33) → default printer (A4) |

## 3. Audit 1 — State Konfigurasi (VERIFIED)

**Query live DB:**
```
SELECT id, borrowCardPrinter, length(borrowCardPrinter) AS len FROM Setting;
→ aba5e401-69be-4dd6-b816-92b9325281be||0|Smansago Library
```

**Temuan:** `borrowCardPrinter = ''` (length 0). User **belum pernah memilih printer** di halaman Settings.

Konsekuensi langsung di `printBorrowCard` (`electron/main/services/print.service.ts:134`):
```ts
const preferredDeviceName = settings.borrowCardPrinter?.trim() || undefined
// → undefined
```
→ heuristik A6 (`resolveA6Printer`) diaktifkan (`resolveA6DeviceName:true`, baris 152) sebagai satu-satunya harapan untuk mengisi `deviceName`.

## 4. Audit 2 — Semantik API Electron (RESEARCH)

Sumber: dokumentasi resmi Electron `webContents.print()` + issue tracker.

### 4.1 Kontrak `webContents.print()`
- `deviceName`: **nama sistem** printer, BUKAN friendly/display name.
- `pageSize`: `string` (A0–A6) **atau** `Size {width, height}` satuan **mikron** (1mm = 1000µm). Validasi minimum 353 µm.
- `usePrinterDefaultPageSize`: default `false`; **tidak boleh** dikombinasikan dengan `pageSize`.
- `silent:true` + `deviceName` kosong → Electron memilih **printer default sistem**.
- `pageSize` tidak valid + `usePrinterDefaultPageSize:false` → **error dilempar** (tidak di-resolve).
- `margins`: `'none'`/`'default'`/`'custom'`; `marginType:'custom'` memerlukan `margins.{top,left,bottom,right}`.

### 4.2 Issue/PR upstream yang relevan
| Ref | Isi | Relevansi |
|-----|-----|-----------|
| #26982 | Custom `pageSize` **tidak di-respect pada mode silent** → pakai default paper size printer | **Langsung**: G2 (A4) |
| #49374 | `webContents.print()` hard-code A4 bila pageSize tidak eksplisit | Melengkapi G2 |
| #28256 | `silent:true` tidak menghormati default printer settings (landscape) — wontfix | Kontekstual |
| #19122 | Windows + `deviceName` bermasalah (era Electron 6) | Historis |
| **PR #50808** | Fix precedence mediaSize saat silent: (1) user-supplied, (2) printer default (`usePrinterDefaultPageSize:true`), (3) A4 fallback. Merged 2026-04-09, backport **41-x-y & 42-x-y** | **Kunci**: TIDAK tersedia di Electron 33.4.11 |

### 4.3 Chromium (Windows) — `printing_context_win.cc`
- Ukuran kertas dikirim via **DEVMODE**: `dmPaperSize` (ID named, mis. `DMPAPER_A6`) atau `DMPAPER_USER` + `dmPaperWidth/dmPaperLength` (custom).
- Komentar resmi: *"If the paper size is a custom user size, setting by ID may not work"* → untuk custom size, Chromium bergantung pada `dmPaperWidth/dmPaperLength`; **driver Epson L3110 harus menerima custom user-defined size** agar tidak menolak job.
- Jika driver tidak mengenali kombinasi yang dikirim → spooler menolak job → callback `success=false`, `failureReason='Print job canceled.'` (**G1**).

## 5. Audit 3 — Alur Kode (VERIFIED, line-exact)

### 5.1 Pemanggil (renderer)
`src/pages/BorrowReceiptPreviewPage.tsx`:
- `const [silentPrint, setSilentPrint] = useState(true)` (baris 42) — **default silent = true** (checkbox UI, baris 244-248).
- `window.electronAPI.print.borrowCard(id, { silent: silentPrint })` (baris 154).

### 5.2 IPC → Preload
- `print.ipc.ts:21-22` — `printing:borrowCard` → `printService.printBorrowCard(borrowingId, options)`.
- `print.preload.ts:11-12` — `borrowCard: (borrowingId, options?) => ipcRenderer.invoke('printing:borrowCard', borrowingId, options)`.

### 5.3 `PrintService.printBorrowCard` (print.service.ts:125-155)
```ts
const preferredDeviceName = settings.borrowCardPrinter?.trim() || undefined  // '' → undefined
await this.printHtml(html, {
  margins: { marginType: 'none' },
  pageSize: { width: 105000, height: 148000 },   // A6 105×148mm (SSOT BORROW_CARD_LAYOUT)
  silent: options?.silent === true,               // true
  resolveA6DeviceName: true,
  preferredDeviceName
})
```

### 5.4 `resolvePrintOptions` (print.service.ts:391-429)
- Base: `margins:{marginType:'default'}` lalu `...rest` (kartu menimpa ke `'none'`), `landscape:false`, `scaleFactor:1`.
- Prioritas `deviceName`:
  1. `deviceName` eksplisit dari caller → (tidak ada di jalur ini)
  2. `preferredDeviceName` dari Settings → **undefined** (Audit 1)
  3. `resolveA6Printer` (heuristik nama) → **run, dan GAGAL menemukan printer A6** (log user baris 459-461)

### 5.5 `resolveA6Printer` (print.service.ts:431-471)
- Ambil `getPrintersAsync()`.
- `matchesHint` = nama/displayName/description mengandung `a6|kartu|card|label|ql-|ql |105x148|105×148`.
- Log user menunjukkan **tidak ada printer yang match hint** → `return null` → `deviceName` **tetap kosong**.
- **Catatan penting:** `listPrinters()` (baris 159-181) hanya memetakan `name/displayName/description/isDefault/status`. **`pageSizes`/`supportsCustomPageSizes` TIDAK tersedia di Electron 33** (komentar baris 39-41) → tidak ada cara programatik memverifikasi dukungan A6 di versi ini.

### 5.6 Hasil akhir opsi yang dikirim
```ts
{
  margins: { marginType: 'none' },
  printBackground: true,
  landscape: false,
  scaleFactor: 1,
  silent: true,
  pageSize: { width: 105000, height: 148000 }   // custom, mikron
  // deviceName: TIDAK ADA
}
```

## 6. Analisis Root Cause

**Rantai kegagalan:**

1. `silent:true` + **tanpa `deviceName`** → Electron pakai **printer default sistem** (kemungkinan "EPSON L3110 Series" yang tidak memiliki hint nama A6/kartu).
2. Custom `pageSize` (105000×148000 µm) dikirim dalam mode silent. Di **Electron 33**, jalur silent tidak meneruskan mediaSize custom dengan andal (bug #26982) → dua kemungkinan hasil:
   - Driver/spooler menerima DEVMODE custom (DMPAPER_USER + dmPaperWidth/Length) yang tidak didukung → **job ditolak** → "Print job canceled." (**G1**).
   - Chromium/Electron menggugurkan pageSize → **fallback A4** (default driver Epson L3110) (**G2**).
3. Tidak ada `deviceName` eksplisit berarti **heuristik A6 adalah satu-satunya penjaga** — dan heuristik itu berbasis nama yang tidak cocok untuk printer Epson (nama "EPSON L3110 Series" tanpa kata kartu/A6/label).

**Mengapa fix tidak bisa "tinggal 1 baris":** fix upstream (#50808) hanya ada di Electron ≥41; di versi terpasang (33.4.11) perilaku silent+pageSize tetap rentan. Pilihan aman adalah kombinasi (a) user memilih printer + (b) tidak mengandalkan custom pageSize di jalur silent, atau (c) upgrade Electron.

## 7. Rekomendasi

### Prioritas 1 (user action — tanpa kode)
1. **User memilih printer di Settings → Kartu Peminjaman** → pilih "EPSON L3110 Series" (nama sistem diisi ke `borrowCardPrinter`). Ini memastikan `deviceName` terkirim eksplisit (prioritas #2 di resolvePrintOptions).
2. **Verifikasi custom paper A6 (105×148mm) ada di driver/printer settings OS** (Windows → Devices and Printers → Printing preferences → Paper size). Jika driver L3110 tidak menyediakan 105×148, silent print akan selalu gagal/menjadi A4.

### Prioritas 2 (kode — perlu WO terpisah)
3. **Perbaikan jalur silent:** pertimbangkan mengirim `pageSize` sebagai **named string `'A6'`** (bukan object custom) bila driver mendukung named A6 — atau kombinasikan dengan `deviceName` eksplisit. **Jangan gunakan `usePrinterDefaultPageSize`** bersama `pageSize` (kontrak melarang).
4. **Evaluasi upgrade Electron** (fix #50808 di ≥41) — WO tersendiri dengan risiko regresi penuh (aplikasi ini mengandalkan API Electron di banyak layer: print, dialog, path, session).
5. **Hilangkan ambiguitas heuristik:** tambahkan hint nama printer Epson (`'l3110'`, `'epson'`?) HANYA jika terbukti driver Epson mendukung A6 — atau tampilkan peringatan eksplisit di UI Preview saat `borrowCardPrinter` kosong ("Cetak akan memakai printer default; pilih printer di Settings untuk hasil A6 yang dijamin").

## 8. File Relevan

| File | Peran |
|------|-------|
| `electron/main/services/print.service.ts` | `printBorrowCard` (125), `preferredDeviceName` (134), `pageSize` (141-144), `silent` (149), `resolveA6DeviceName` (152), `resolvePrintOptions` (391), prioritas deviceName (415-417), `resolveA6Printer` (431), `listPrinters` (159) |
| `src/pages/BorrowReceiptPreviewPage.tsx` | Caller: `silentPrint` default true (42), `borrowCard(id,{silent})` (154) |
| `src/pages/SettingsPage.tsx` | Field `borrowCardPrinter` (30, 81, 130), `listPrinters` (66), dropdown printer (312-329) |
| `electron/ipc/setting.ipc.ts` | `settings:listPrinters` (22) |
| `electron/ipc/print.ipc.ts` | `printing:borrowCard` (21-22) |
| `electron/main/repositories/setting.repository.ts` | Default `borrowCardPrinter:''` (28) |
| `src/main/services/borrow-card.service.ts` | `BORROW_CARD_LAYOUT` = 105×148mm (SSOT, baris 27-28) |
| `prisma/aplibrary.db` | `Setting` id `aba5e401…`, `borrowCardPrinter=''` (verified) |
| `package.json` | `electron ^33.4.11` (40) |

## 9. Status

**Audit SELESAI — READ ONLY.** Tidak ada perubahan kode yang dilakukan. Rekomendasi Prioritas 1 (user action) dan Prioritas 2 (WO kode) menunggu keputusan Product Owner.
