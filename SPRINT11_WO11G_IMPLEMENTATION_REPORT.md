# SPRINT 11 — WO-11-G: Fix File Selection — handleFiles() Read-Before-Reset (COMPLETE — READY review PO)

## Ringkasan
Memperbaiki bug seleksi file di halaman Import Buku sesuai **Root Cause yang telah disetujui PO** (dari `SPRINT11_FILE_SELECTION_RUNTIME_INVESTIGATION.md`). `handleFiles()` di `FileUploadDropzone.tsx` sebelumnya melakukan reset `input.value = ''` **SEBELUM** membaca `files` — karena parameter `files` adalah referensi **live `FileList`**, reset tersebut mengosongkannya, sehingga `files.length === 0` → `onFileChange(null)` → file .xlsx valid dibuang diam-diam (silent no-op). Fix: **baca & simpan objek File terlebih dahulu ke variabel lokal, baru reset `input.value`**.

## 1. Files Changed
| File | Perubahan |
|------|-----------|
| `src/components/books/FileUploadDropzone.tsx` | `handleFiles()`: urutan diubah — `const selectedFile = files && files.length > 0 ? files[0] : null` dievaluasi **sebelum** `inputRef.current.value = ''`; lalu `onFileChange(selectedFile)`. |
| `wo11g/runtime.cjs` | Driver runtime validation (aplikasi nyata Electron + CDP) — bukti 16/16 PASS. |

TIDAK ada perubahan lain: schema/migration, IPC, preload, bootstrap, hook workflow, context, labels, config, atau halaman lain.

## 2. Behavior Changed
- **Sebelum:**
  ```tsx
  function handleFiles(files: FileList | null) {
    if (inputRef.current) inputRef.current.value = ''        // RESET dahulu → FileList live ikut kosong
    onFileChange(files && files.length > 0 ? files[0] : null) // files.length === 0 → null
  }
  ```
- **Sesudah:**
  ```tsx
  function handleFiles(files: FileList | null) {
    const selectedFile = files && files.length > 0 ? files[0] : null  // BACA dahulu → objek File tersimpan
    if (inputRef.current) inputRef.current.value = ''                  // reset input (tetap dipertahankan)
    onFileChange(selectedFile)                                          // terima File, bukan null
  }
  ```

Efek berantai setelah fix: `onFileChange(File)` → `selectFile(File)` → `setFile(File)` → kartu file tampil, pesan "Belum ada file yang dipilih." hilang, tombol **Lanjut** aktif.

## 3. Validation — Build & Lint
| Check | Hasil |
|-------|-------|
| `npm run lint` | PASS (tsc node + tsc web, 0 error) |
| `npm run build` | PASS (main 1,750.02 kB · preload 6.68 kB · renderer 894.05 kB) |

## 4. Runtime Validation — 16/16 PASS
Metode: **aplikasi nyata** (`electron .` dari `out/` + CDP `chrome-devtools`) — alur produksi asli, bukan simulasi. Driver: `wo11g/runtime.cjs` (spawn Electron, navigasi `#/books/import`, set file via `DOM.setFileInputFiles` — memicu event `input`/`change` native — dan dispatch `DragEvent('drop')`).

| # | Bukti | Hasil |
|---|-------|-------|
| R1 | Halaman Import Buku dirender (dropzone tampil) | PASS |
| R2 | Awal — pesan "Belum ada file yang dipilih." tampil | PASS |
| R3 | Awal — tombol Lanjut disabled | PASS |
| R4 | Hidden file input ditemukan di DOM | PASS |
| R5 | **Nama file tampil** di UI (Template_Import_Buku_v2.0.xlsx) | PASS |
| R6 | **State File terisi** — pesan "Belum ada file" hilang | PASS |
| R7 | Kartu file tampil (tombol Ganti/Hapus) | PASS |
| R8 | **Tombol Lanjut aktif** (enabled) | PASS |
| R9 | `input.value` tetap di-reset SETELAH file dibaca (bukti urutan fix) | PASS |
| R10 | **File yang sama dapat dipilih kembali** (nama tetap tampil) | PASS |
| R11 | Tombol Lanjut tetap aktif setelah re-select | PASS |
| R12 | File dihapus → dropzone kembali tampil | PASS |
| R13 | Event drop ter-dispatch ke dropzone | PASS |
| R14 | **Drag & Drop tetap berfungsi** — nama file tampil | PASS |
| R15 | Drag & drop — tombol Lanjut aktif | PASS |
| R16 | State drag-active tidak menggantung (kartu file stabil) | PASS |

**WO11G RUNTIME RESULT: 16 passed, 0 failed.**

## 5. Architecture Checklist
| Kriteria | Status |
|----------|--------|
| Fix berada di lapisan renderer (komponen UI), sesuai root cause | PASS |
| Tidak ada perubahan backend/IPC/preload/bootstrap | PASS |
| Reset `input.value` dipertahankan (file yang sama tetap bisa dipilih ulang) | PASS |
| Tidak ada perubahan business logic / hook / context | PASS |
| Runtime validation memakai aplikasi nyata + event native (bukan simulasi) | PASS |
| Lint + Build + Runtime 16/16 PASS | PASS |

## 6. Note
Perubahan hanya 3 baris di satu file renderer. Seluruh kerja lain (investigasi, UAT) sudah terdokumentasi terpisah. Tidak ada file baru selain driver runtime `wo11g/runtime.cjs`.

**Status: DONE — Architecture Gate BERHENTI**, menunggu review Product Owner (tidak lanjut WO berikutnya).
