# SPRINT 11 — WO-11-F: Download Template Integration (COMPLETE — READY review PO)

## Ringkasan
Tombol "Download Template" di halaman Import Buku kini berfungsi penuh end-to-end: IPC handler `imports:downloadTemplate` di main → bridge preload `imports.downloadTemplate()` → `handleDownloadTemplate()` di `BookImportPage` memanggil IPC. Placeholder **"Template akan tersedia di Sprint 3."** dihapus total. `templates/Template_Import_Buku_v2.0.xlsx` di-package ke produksi (`extraResources`), dengan penanganan error untuk 3 kasus: user membatalkan save dialog, template tidak ditemukan, gagal menulis file.

## 1. Files Changed
| File | Perubahan |
|------|-----------|
| `src/types/import.ts` | **`DownloadTemplateResult`** (union): `{ status:'saved', filePath }` | `{ status:'cancelled' }` | `{ status:'error', message }`. |
| `electron/ipc/book-import.ipc.ts` | Handler baru `ipcMain.handle('imports:downloadTemplate', ...)`: resolve path template (dev `app.getAppPath()/templates`, packaged `process.resourcesPath/templates`); guard `fs.existsSync` → not-found; `dialog.showSaveDialog` (via `BrowserWindow.fromWebContents(event.sender)`, defaultPath `Template_Import_Buku_v2.0.xlsx`, filter `.xlsx`); `fs.promises.copyFile`; catch → pesan error. Handler `imports:match` dipertahankan identik. |
| `electron/preload/book-import.preload.ts` | Bridge baru `downloadTemplate: () => ipcRenderer.invoke('imports:downloadTemplate')` di `bookImportAPI.imports`. |
| `src/renderer/env.d.ts` | `imports.downloadTemplate: () => Promise<DownloadTemplateResult>`. |
| `src/pages/BookImportPage.tsx` | `handleDownloadTemplate` async: hapus stub `setShowTemplateNote(true)`; panggil IPC; tampilkan pesan sukses/cancel/error via label; state `downloading` (disable tombol) + `downloadMessage`; blok placeholder (`showTemplateNote`/`TEMPLATE_PLACEHOLDER`) dihapus. |
| `src/utils/labels.ts` | Hapus `TEMPLATE_PLACEHOLDER`; tambah `DOWNLOAD_SUCCESS`, `DOWNLOAD_CANCELLED`, `DOWNLOAD_ERROR`. |
| `electron-builder.yml` | `extraResources` baru: `from: templates/`, `to: templates/`, filter `Template_Import_Buku_v2.0.xlsx`. |
| `wo11f/smoke.ts` | Smoke script (copy + byte-compare + buka xlsx + error paths). |

TIDAK ada perubahan: schema/migration, Import Engine, Validation, Repository, Database, Preview, Multi Copy, Inventory, Barcode, template Excel itu sendiri.

## 2. Behavior Changed
- **Sebelum:** `handleDownloadTemplate()` hanya `setShowTemplateNote(true)`; UI menampilkan teks statis "Template akan tersedia di Sprint 3." (`labels.ts:252`); tidak ada IPC/preload/dialog; `templates/` tidak di-package (fitur tidak berfungsi di produksi).
- **Sesudah:**
  - Klik "Download Template" → **save dialog OS** muncul (default nama `Template_Import_Buku_v2.0.xlsx`, filter Excel).
  - Simpan → file tersalin ke lokasi pilihan; pesan sukses "Template Import Buku v2 berhasil diunduh.".
  - Batal → `{ status:'cancelled' }` → pesan "Unduhan template dibatalkan." (tanpa error).
  - Template tidak ada di resources → pesan "Template tidak ditemukan.".
  - Gagal menulis (direktori tak valid, akses ditolak) → pesan error berisi detail `Error.message`.
  - Mode dev (`app.getAppPath()`), mode packaged (`process.resourcesPath`) — keduanya ter-resolve.

## 3. Validation
- **Smoke `wo11f/smoke.ts`: 10/10 PASS.**
- **`npm run lint` PASS.**
- **`npm run build` PASS** (main 1,750.02 kB · preload 6.68 kB · renderer 894.01 kB).
- **Packaging `electron-builder --win nsis --x64 --publish never` PASS** → `dist/win-unpacked/resources/templates/Template_Import_Buku_v2.0.xlsx` ada, **14.680 byte, byte-identical** dengan source; installer `dist/APLibrary Setup 0.1.0.exe` terbentuk.
- **`app.asar`** berisi `imports:downloadTemplate` (2x) dan label sukses (1x).

## 4. Smoke Test
| Bukti | Hasil |
|-------|-------|
| S1: template v2 ada di repositori | PASS |
| S2: file berhasil disalin (simulasi save dialog) | PASS |
| S3: **isi identik byte-per-byte** | PASS (14680B = 14680B) |
| S4: file tersimpan dapat dibuka sebagai xlsx (1 sheet) | PASS |
| S5: sheet "Import Buku" | PASS |
| S6/S6b: header 17 kolom data + kolom petunjuk (19 sel; c17 kosong, c18 "PETUNJUK PENGGUNAAN") | PASS |
| S7: 6 kolom wajib urutan benar (Judul…Jumlah Copy) | PASS |
| S8: guard template tidak ditemukan (`existsSync` false) | PASS |
| S9: write ke folder tidak valid melempar error (→ status error) | PASS |

## 5. Packaging Verification
- `dist/win-unpacked/resources/templates/Template_Import_Buku_v2.0.xlsx` — ada, 14.680 B, **byte-identical** (SequenceEqual) terhadap `templates/Template_Import_Buku_v2.0.xlsx`.
- `process.resourcesPath/templates` = lokasi yang di-resolve handler saat `app.isPackaged` → mekanisme cocok.
- `app.asar` mengandung string handler (`imports:downloadTemplate`) dan label renderer baru.
- Catatan env: builder butuh `--config.win.signAndEditExecutable=false` + `CSC_IDENTITY_AUTO_DISCOVERY=false` (ekstraksi `winCodeSign` gagal pada akun tanpa privilege symlink) — build packaging tetap utuh, hanya menonaktifkan rcedit/signing.

## 6. Build PASS
`npm run build` PASS — main 1,750.02 kB · preload 6.68 kB · renderer 894.01 kB.

## 7. Lint PASS
`npm run lint` PASS (tsc node + tsc web).

## 8. Rollback
```powershell
# revert 3 file tracked (labels.ts/env.d.ts hanya bagian WO-11-F; git checkout -- seluruhnya akan mengembalikan state HEAD lama)
git checkout -- electron-builder.yml src/renderer/env.d.ts src/utils/labels.ts
# 4 file untracked — hapus manual jika perlu (hilangkan handler/bridge/download):
# electron/ipc/book-import.ipc.ts, electron/preload/book-import.preload.ts,
# src/pages/BookImportPage.tsx (ganti ke versi stub), src/types/import.ts (hapus DownloadTemplateResult)
Remove-Item -Recurse -Force wo11f
# rebuild out/ + dist/ bila rollback dieksekusi
```

## 9. Architecture Checklist
| Kriteria | Status |
|----------|--------|
| IPC handler di main (bukan renderer) | PASS |
| Bridge preload `downloadTemplate()` + env.d.ts | PASS |
| UI panggil IPC; placeholder "Sprint 3" hilang total (0 match di `src/`) | PASS |
| Error handling: cancel / not-found / write-fail | PASS |
| Template di-package ke produksi (extraResources) & byte-identical | PASS |
| Pattern existing: `registerBookImportHandlers` + `bookImportAPI.imports` (tidak menyentuh arsitektur lain) | PASS |
| Handler `imports:match` tidak berubah | PASS |
| Zero schema change / zero migration / template Excel tidak diubah | PASS |
| Smoke 10/10 + Lint + Build PASS + packaging verified | PASS |

## 10. Note
Kolom header template v2 yang terdeteksi dari file: 19 sel (17 kolom data + sel kosong + "PETUNJUK PENGGUNAAN") — ini adalah struktur aset template yang memang ada (di luar scope WO-11-F; kontrak WO-11-F = byte-identity hasil download terhadap aset).

**Status: DONE — Architecture Gate BERHENTI**, menunggu review Product Owner (tidak lanjut WO berikutnya).
