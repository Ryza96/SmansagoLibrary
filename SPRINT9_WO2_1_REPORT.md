# SPRINT9_WO2_1_REPORT.md

Feature: **Book Import — Parsing Trigger Refactor (WO-2.1)**
Mode: IMPLEMENTATION
Date: 2026-07-31

---

## 1. Implementation Report

Refactor pemindahan trigger parsing: seleksi file hanya validasi file-level; tombol "Lanjut" yang memicu `readWorkbook` + `validate`; preview menangani state parsing & guard deep-link. Prinsip: **pindahkan trigger, jangan tulis ulang service** — `WorkbookReaderService`, `ValidationEngineService`, `HeaderNormalizerService`, Matching Engine, dan service layer TIDAK disentuh.

### Perubahan File

| File | Perubahan |
|------|-----------|
| `src/hooks/useBookImportWorkflow.ts` | **RC-1** — `selectFile` dipangkas menjadi validasi file-level (IMP-001/002/003) + set state `file`/`errorCode`/`validatedWorkbook(null)`/`parsing(false)`, TANPA parsing. Aksi baru `parseAndValidate(): Promise<boolean>` — membaca file dari context, menjalankan `readWorkbook` → `validate`, return `true` bila berhasil (validatedWorkbook terisi), `false` bila gagal/kadaluarsa; guard race `parseSeq` dipertahankan & diperluas (`selectFile` kini ikut menaikkan seq untuk membatalkan parse in-flight). |
| `src/pages/BookImportPage.tsx` | **RC-2** — `handleContinue` menjadi async: memanggil `parseAndValidate()`, navigasi ke preview **hanya bila sukses**; guard `submitting` lokal anti double-click; `isValid` menambahkan `!submitting`. |
| `src/pages/BookImportPreviewPage.tsx` | **RC-3** — `useEffect` guard deep-link: bila `!file`, atau file ada tapi belum diparse & tidak parsing & tidak error (`!parsing && !validatedWorkbook && !errorCode`) → `navigate(ROUTES.BOOK_IMPORT, { replace: true })`. State `parsing` (Hourglass "Memproses file Excel...") yang sudah ada dipertahankan untuk transit. |

### Alur aktual setelah refactor

```
Pilih file .xlsx
  └─ selectFile(file)
       ├─ validateImportFile → IMP-001/002/003 (file-level)      [WO-1]
       └─ setFile / setErrorCode / setValidatedWorkbook(null)
           └─ Tampil nama file (TANPA parsing)
Klik "Lanjut" (enabled bila file-level valid)
  └─ handleContinue → parseAndValidate()
       ├─ setParsing(true) → readWorkbook → validate               [WO-2 + WO-3]
       ├─ setValidatedWorkbook / setErrorCode(null) / setParsing(false)
       └─ return true
           └─ navigate('/books/import/preview')
[BookImportPreviewPage]
  └─ guard deep-link (tanpa file → redirect ke /books/import)
  └─ render validatedWorkbook (statistik, validasi, tabel)
```

### Service layer TIDAK diubah (sesuai larangan WO)
`WorkbookReaderService`, `ValidationEngineService`, `HeaderNormalizerService`, `MatchingEngineService`, `MatchProviders`, `match-strategy` — tidak ada diff.

### Validasi
| Tes | Hasil |
|-----|-------|
| `npm run lint` (node + web tsconfig) | PASS — exit 0 |
| `npm run build` (electron-vite build) | PASS — ✓ built, exit 0 |

---

## 2. Architecture Checklist

| Kriteria | Status | Bukti |
|----------|--------|-------|
| RC-1a: `selectFile` hanya validasi file-level + set state (tanpa parse) | ✅ | `useBookImportWorkflow.ts:16-34` — tidak memanggil `readWorkbook`/`validate` |
| RC-1b: aksi `parseAndValidate()` terpisah, memuat `readWorkbook` + `validate` | ✅ | `useBookImportWorkflow.ts:36-60` |
| RC-2: tombol "Lanjut" memanggil `parseAndValidate()` → navigate setelah sukses | ✅ | `BookImportPage.tsx:20-29` |
| RC-3a: preview menangani state `parsing` | ✅ | `BookImportPreviewPage.tsx:205-209` (Hourglass) — dipertahankan |
| RC-3b: preview guard deep-link | ✅ | `BookImportPreviewPage.tsx:175-179` — redirect `replace` ke `/books/import` |
| Guard race (parseSeq) dipertahankan & diperluas ke ganti-file | ✅ | `useBookImportWorkflow.ts:10,17,42-48` — `selectFile` membatalkan parse in-flight |
| Service layer tidak diubah | ✅ | grep: 0 perubahan pada service |
| RC-4 (state machine) ditunda | ⏸️ | — |
| RC-5 (matching wiring) bukan scope | ⏸️ | — |
| lint + build hijau | ✅ | bagian 1 |

---

## 3. Decision Log

| ID | Keputusan | Alasan | Konsekuensi |
|----|-----------|--------|-------------|
| DEC-01 | `parseAndValidate` mengambil `file` dari context (bukan parameter) | Trigger hanya dipanggil dari halaman import; file tunggal di context; API hook lebih bersih | Koneksi file ↔ aksi tetap eksplisit via context |
| DEC-02 | `parseAndValidate` return `Promise<boolean>`; navigasi hanya bila `true` | Navigasi di-trigger oleh pemanggil (halaman), menjaga hook UI-agnostic | Gagal baca (IMP-004) → tetap di halaman import, pesan error tampil; tidak ada navigasi |
| DEC-03 | Navigasi tetap terjadi walau `validationResult.valid === false` | Mempertahankan perilaku F-7 yang sudah disetujui audit: preview yang menampilkan error validasi; `errorCode` (file-level) satu-satunya pemblokir | `errorCode` null setelah parse sukses; header/row error tampil di preview |
| DEC-04 | `selectFile` ikut menaikkan `parseSeq` | Membatalkan parse in-flight saat user mengganti file — mencegah state basi (analog perilaku lama) | Parse yang berjalan dibuang tanpa setState |
| DEC-05 | Guard deep-link memakai `navigate(..., { replace: true })` | Mencegah tombol Back kembali ke preview yang tidak punya konteks | UX deep-link bersih |
| DEC-06 | Guard `submitting` lokal ditambahkan | `parseAndValidate` kini async; mencegah double-click memicu parse ganda sebelum `parsing` tersetel | `isValid` kini `file && !errorCode && !parsing && !submitting` |

---

## 4. Technical Debt

| ID | Utang | Detail | Dampak | Rencana |
|----|-------|--------|--------|---------|
| TD-01 | Kombinasi state boolean tetap (belum state machine) | RC-4 ditunda: `file/errorCode/parsing/validatedWorkbook` sebagai 4 state terpisah; kombinasi tak valid (mis. `file` ada tapi `validatedWorkbook` null tanpa `parsing`) masih mungkin | Guard preview menangani deep-link; kombinasi liar dilindungi `parseSeq` | RC-4 bila dibutuhkan (audit state di WO berikutnya) |
| TD-02 | Guard preview tidak men-trigger parse ulang | Preview hanya redirect bila belum diparse — tidak mencoba `parseAndValidate` saat deep-link | Deep-link `/books/import/preview` selalu kembali ke halaman import (bukan auto-parse) | Diterima: sesuai keputusan RC-2 (parse di "Lanjut"); alternatif parse-on-mount dicatat di audit §3 |
| TD-03 | `parsing` duplikat semantik dengan `submitting` | Context `parsing` (parse in-flight) + local `submitting` (klik in-flight) | Dua sumber sinyal untuk menonaktifkan tombol; minor | RC-4 state machine akan menggabungkannya |
| TD-04 | Tidak ada AbortController untuk `read-excel-file` | File (≤5 MB) dibaca utuh walau hasilnya bakal dibuang `parseSeq` | Waste pada ganti-file cepat; minor | Opsional, di luar scope WO-2.1 |
| TD-05 | `isValid` mengabaikan `validationResult.valid` | Lanjut terbuka walau struktur workbook invalid (error tampil di preview) | Perilaku disengaja (DEC-03), perlu disepakati PO sebagai kontrak | Dokumentasi alur (sprint ini) |

---

**Status: READY untuk review.** Perubahan hanya 3 file UI/hook — service layer & DB tidak tersentuh. Menunggu review Product Owner.
