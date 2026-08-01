# SPRINT 11 — File Selection Runtime Investigation (READ ONLY — DONE)

> Mode: READ ONLY. Tidak ada kode yang diubah. Investigasi runtime memakai aplikasi nyata (`electron .` dari `out/` + CDP `chrome-devtools`), bukan simulasi.
> Reproduksi PO berhasil: **memilih file .xlsx valid → UI tetap diam** (tidak ada kartu file, tidak ada error, tidak ada parsing).

---

## 1. Runtime Flow (yang dieksekusi saat PO memilih file)

```
Klik dropzone (FileUploadDropzone.tsx:82 → inputRef.click())
  → dialog native OS (HTML <input type="file">, TIDAK ADA IPC)
  → user pilih Template_Import_Buku_v2.0.xlsx
  → event 'change' → React onChange → handleFiles(e.target.files)      [FileUploadDropzone.tsx:63 / 17]
       → inputRef.current.value = ''                                   [FileUploadDropzone.tsx:18]
       → onFileChange(files && files.length > 0 ? files[0] : null)     [FileUploadDropzone.tsx:19]
            → selectFile(next)                                          [useBookImportWorkflow.ts:12]
                 → validateImportFile(next)                             [bookImport.ts:15]
                 → setFile(next); setValidatedWorkbook(null); setErrorCode(code)  [useBookImportWorkflow.ts:24-27]
  → parseAndValidate() HANYA dipanggil saat tombol "Lanjut" ditekan     [BookImportPage.tsx:21-30 handleContinue]
```

**Pemilihan file TIDAK memakai IPC sama sekali.** Tidak ada `window.electronAPI.*` di alur ini; murni objek `File` browser dari HTML input. (Jawaban pertanyaan #2: tidak ada IPC; path file tidak pernah dikirim ke main.)

---

## 2. Root Cause (terbukti di runtime)

**Bug urutan baca/bersihkan di `FileUploadDropzone.tsx:17-20`:**

```tsx
function handleFiles(files: FileList | null) {
  if (inputRef.current) inputRef.current.value = ''        // baris 18: RESET dahulu
  onFileChange(files && files.length > 0 ? files[0] : null) // baris 19: BARU baca
}
```

Parameter `files` adalah referensi **live `FileList`** dari `e.target.files`. Baris 18 menetapkan `input.value = ''` → **mengosongkan referensi FileList tersebut di Chromium/Electron** → pada baris 19 `files.length === 0` → `onFileChange(null)` → `selectFile(null)` → `setFile(null)`. File .xlsx valid **dibuang diam-diam** (silent no-op, tanpa exception).

Bukti eksperimen di renderer nyata (CDP):
| Eksperimen | Hasil |
|---|---|
| FileList di-capture lalu `input.value=''` | `lenBefore=1` → `lenAfter=0` (referensi live ikut kosong) |
| Native `change` event saat seleksi (probe) | `fired=true, len=1, name=Template_Import_Buku_v2.0.xlsx` |
| Setelah seleksi: `input.value` | `""` → membuktikan `handleFiles` JALAN (hanya dia yang reset) |
| Setelah seleksi: kartu file tampil? | `false` → `selectFile` menerima `null` |
| `Runtime.exceptionThrown` / `consoleAPICalled` / `Log.entryAdded` | **0 event** → tidak ada exception |
| `document.body.innerText` sebelum vs sesudah | **identik** (tetap "Belum ada file yang dipilih.") |

---

## 3. Exception

**TIDAK ADA exception.** Ini bukan kasus try/catch yang menelan error — tidak ada yang melempar sama sekali. `selectFile` tidak punya try/catch; `handleFiles` tidak throw; `validateImportFile` murni operasi string. Kegagalan adalah **bug logika nilai-null yang dibuang tanpa pesan** (silent no-op). (Jawaban pertanyaan #4: tidak ada exception yang tertangkap/diabaikan.)

---

## 4. State Transition (Jawaban pertanyaan #5 & #6)

| State | Sebelum | Sesudah seleksi (harapan) | Sesudah seleksi (realita) |
|---|---|---|---|
| `file` | `null` | `File(Template_Import_Buku_v2.0.xlsx)` | **tetap `null`** |
| `errorCode` | `null` | `null` (file valid) | **tetap `null`** |
| `validatedWorkbook` | `null` | `null` (belum parse) | **tetap `null`** |
| `parsing` | `false` | `false` | **tetap `false`** |

Penyebab: `selectFile(null)` dipanggil (bukan dengan File) → seluruh cabang `if (!next)` di `useBookImportWorkflow.ts:17-22` dieksekusi (`setFile(null); setErrorCode(null); setValidatedWorkbook(null)`), nilai akhir identik dengan kondisi awal → React re-render menghasilkan output DOM yang sama → **UI diam total**.

---

## 5. Jawaban Pertanyaan 1–3, 7 (ringkas)

1. **`selectFile()` terpanggil?** YA — event `change` jalan (bukti: `input.value` menjadi `""`), tapi dipanggil dengan argumen **`null`**, bukan `File`.
2. **IPC mengembalikan path?** TIDAK ADA IPC. Alur memakai HTML `<input type="file">` murni (renderer). Tidak ada `dialog.showOpenDialog`, tidak ada channel, tidak ada nilai path.
3. **`parseAndValidate()` dipanggil setelah pilih file?** TIDAK — dua lapis:
   - (a) Desain: parsing hanya dipicu tombol **"Lanjut"** (`BookImportPage.tsx:25` → `handleContinue`); memilih file saja memang tidak mem-parse.
   - (b) Bug: `file` tetap `null`, sehingga bahkan "Lanjut" buntu di guard `if (!file) return false` (`useBookImportWorkflow.ts:33`).
7. **Lokasi yang menghentikan alur:**
   - File: **`src/components/books/FileUploadDropzone.tsx`**
   - Function: **`handleFiles()`**, baris **18** (`inputRef.current.value = ''` dijalankan SEBELUM membaca `files`).
   - Rantai: baris 18 → baris 19 `files.length===0` → `onFileChange(null)` → `selectFile(null)`.

---

## 6. Lokasi Kegagalan (detail)

| # | File | Baris | Peran |
|---|---|---|---|
| 1 | `src/components/books/FileUploadDropzone.tsx` | **18** | `inputRef.current.value = ''` → mengosongkan FileList live (TITIK PENYEBAB) |
| 2 | `src/components/books/FileUploadDropzone.tsx` | 19 | `files.length > 0` false → `onFileChange(null)` |
| 3 | `src/hooks/useBookImportWorkflow.ts` | 17-22 | `selectFile(null)` → reset state ke kosong |
| 4 | `src/pages/BookImportPage.tsx` | 21-30 | `parseAndValidate` hanya di "Lanjut" (bukan bug, desain) |

File ini **untracked** (`??` di git) — bug berasal dari working tree (era Sprint 5+, sebelum WO-11-F), bukan diperkenalkan WO-11-F. Tidak pernah tersentuh UAT end-to-end UI nyata (WO-3 UAT headless langsung ke pipeline, melewati renderer).

---

## 7. Rencana Perbaikan (BELUM dieksekusi — READ ONLY)

1. **Wajib — ubah urutan baca:** di `handleFiles`, baca & simpan `files[0]` **sebelum** reset:
   ```tsx
   function handleFiles(files: FileList | null) {
     const selected = files && files.length > 0 ? files[0] : null
     if (inputRef.current) inputRef.current.value = ''
     onFileChange(selected)
   }
   ```
2. **Opsional — hapus reset** `value=''` (tidak wajib; memilih file yang sama lagi tetap memicu `change` di Chromium karena state input berubah), atau reset **setelah** `onFileChange`.
3. **Opsional — guard:** jika `files.length === 0`, jangan panggil `onFileChange` sama sekali.
4. **Proses (disarankan):** UAT E2E wajib menyentuh UI nyata (CDP `DOM.setFileInputFiles` atau klik sungguhan), bukan hanya pipeline headless, supaya bug lapisan renderer seperti ini tertangkap.

---

## 8. Temuan Tambahan — Artifact Produksi TIDAK BISA DIBUKA (PENTING utk konteks UAT)

Saat mencoba menjalankan `dist/win-unpacked/APLibrary.exe` untuk reproduksi, main process **crash saat startup** dengan dialog native:

```
A JavaScript error occurred in the main process
Uncaught Exception:
Error: Cannot find module '.prisma/client/default'
Require stack:
- ...dist\win-unpacked\resources\app.asar\node_modules\@prisma\client\default.js:2:6
- ...dist\win-unpacked\resources\app.asar\out\main\index.js
```

- **Penyebab:** `electron-builder` menghapus folder bertitik `node_modules/.prisma/client/` (hasil `prisma generate`) dari asar. Verifikasi: asar berisi `node_modules/@prisma/client/` (34 entri) tapi **0 entri `.prisma`**; `app.asar.unpacked` bahkan tidak ada. `electron-builder.yml` (files/extraResources/asarUnpack) tidak berubah dari HEAD kecuali entri `templates/` WO-11-F.
- **Konsekuensi:** build produksi saat ini (`dist/win-unpacked` + `APLibrary Setup 0.1.0.exe`) **tidak dapat dijalankan di mesin mana pun** — crash di `initDatabase()` (`electron/main/index.ts:36`). UAT yang dilaporkan PO (bisa membuka Menu Buku, klik tombol) tidak mungkin berasal dari artifact produksi ini; kemungkinan besar PO menjalankan build lain (mis. mode dev / build lama yang berfungsi) atau versi lama yang diinstal.
- **Rencana (terpisah):** tambahkan ke `files` pola eksplisit agar `.prisma` masuk asar, ATAU ubah `@prisma/client` agar memakai client yang di-unpack, lalu verifikasi dengan `npx asar list` + start smoke packaged. (Di luar scope investigasi ini; tidak dieksekusi.)

---

## 9. Kesimpulan

1. **Alur file-selection terhenti di `FileUploadDropzone.tsx:18`** — reset `value=''` sebelum membaca `files` mengosongkan `FileList` live → `selectFile(null)` → state tidak berubah → UI diam. **Bukan exception**, melainkan silent no-op.
2. `parseAndValidate` memang tidak dipanggil saat memilih file (desain: hanya tombol "Lanjut"); dan karena `file` null, tombol itu pun tak berfungsi.
3. Tidak ada IPC pada pemilihan file; seluruh alur di renderer.
4. Temuan sekunder: **artifact produksi saat ini crash di startup** (Prisma client dot-folder tidak masuk asar) — perlu perbaikan packaging terpisah agar UAT produksi bisa berjalan.

**Status: DONE — READ ONLY. Tidak ada kode diubah. Berhenti di sini.**
