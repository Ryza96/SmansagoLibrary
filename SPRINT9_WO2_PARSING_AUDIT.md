# SPRINT9_WO2_PARSING_AUDIT.md

Audit tahap Parsing — Book Import Pipeline
Mode: READ ONLY (tanpa perubahan kode)
Date: 2026-07-31

---

## 1. Current Flow

### Alur aktual (ditelusuri dari kode)

```
[BooksPage]
Klik tombol "Import Excel" (BooksPage.tsx:71-77)
  └─ navigate('/books/import')
        └─ [BookImportPage] render dropzone (BookImportPage.tsx:11-88)
              └─ User pilih file .xlsx (klik dropzone → input[type=file] / drag-drop)
                    └─ FileUploadDropzone.handleFiles(files)  (FileUploadDropzone.tsx:17-20)
                          └─ selectFile(files[0])  (BookImportPage.tsx:43 → useBookImportWorkflow.ts:12-48)
                                │
                                ├─ 1. validateImportFile(file)         [A] ekstensi+size → IMP-001/002/003
                                ├─ 2. setFile / setErrorCode / setValidatedWorkbook(null) / setParsing(false)
                                ├─ 3. bila invalid (code != null) → RETURN  (parsing TIDAK jalan)
                                │
                                └─ 4. setParsing(true)
                                      ├─ readWorkbook(file)            [B] WorkbookReaderService → read-excel-file/browser
                                      │      → RawWorkbook { sheets:[{name, rows}] }
                                      │      → gagal → ImportReaderError(IMP-004)
                                      ├─ validate(rawWorkbook)         [C] ValidationEngineService (sync, segera setelah B)
                                      │      → HeaderNormalizerService.normalizeHeader
                                      │      → IMP-005..009 (struktur), IMP-010/011/012 (header),
                                      │        IMP-013/014 (baris) → canonicalRows, rowResults, validationResult
                                      ├─ setValidatedWorkbook / setErrorCode(null)
                                      └─ setParsing(false)
                                            │   (guard race: parseSeq ref — hasil async basi dibuang)
                                            ▼
[BookImportPage] teks "File siap diproses." (READY) + tombol "Lanjut" enabled
  └─ klik "Lanjut" (BookImportPage.tsx:19-22 → 76-83)
        └─ navigate('/books/import/preview')
              └─ [BookImportPreviewPage] render DARI CACHE validatedWorkbook
                     (tidak ada readWorkbook/validate lagi; BookImportPreviewPage.tsx:170-315)

Titik A = seleksi file     (WO-1: validasi ekstensi/ukuran)     ← Posisi BENAR
Titik B = seleksi file     (WO-2: baca workbook)                ← Terjadi SEBELUM "Lanjut"
Titik C = seleksi file     (WO-3: validasi struktur+header+row) ← Terjadi SEBELUM "Lanjut"
Preview = render pasif      (konsumsi validatedWorkbook cache)   ← Tidak pernah memicu parse
Matching = TIDAK ter-wire    (MatchingEngineService 0 pemanggil)  ← Belum ada titik panggil
```

### Peta pemanggil (hasil grep)

| Method | Pemanggil |
|--------|-----------|
| `workbookReaderService.readWorkbook` | hanya `useBookImportWorkflow.ts:34` |
| `validationEngineService.validate` | hanya `useBookImportWorkflow.ts:37` |
| `matchingEngineService` | tidak ada (0 pemanggil di `src/`) |

### Jawaban atas pertanyaan audit

| Pertanyaan | Jawaban aktual |
|------------|----------------|
| Bagaimana alur file dipilih? | Dropzone (klik/OS dialog / drag-drop) → `handleFiles` → `selectFile(files[0])` |
| Kapan workbook mulai dibaca? | **Saat file dipilih**, berantai di dalam `selectFile` (bukan saat "Lanjut") |
| Kapan validasi dijalankan? | **Saat file dipilih**, sinkron tepat setelah `readWorkbook` selesai |
| Kapan preview dibuat? | Data preview (`validatedWorkbook`) **di-*construct* saat seleksi**; halaman preview **dirender saat "Lanjut" diklik** — murni membaca cache |
| Apakah trigger parsing berada di tempat yang tepat? | **Tidak.** Trigger ada di seleksi; seharusnya di titik transisi (klik "Lanjut" / preview mount) |

---

## 2. Findings

**F-1 — Trigger parsing terlalu dini dan menyatu dengan seleksi.**
`selectFile` menjalankan `readWorkbook` + `validate` berantai. Seluruh tahap parse (WO-2) dan validate (WO-3) dieksekusi sebelum user mengonfirmasi lewat tombol "Lanjut". Arsitektur Sprint 9 adalah pipeline bertahap **parse → validate → match → commit**; setiap stage seharusnya ter-trigger di titik kontrolnya, bukan dibor semuanya di seleksi.

**F-2 — Tombol "Lanjut" kehilangan peran sebagai gate stage.**
Karena parsing sudah selesai saat seleksi, "Lanjut" hanya menunggu `!parsing` lalu menjadi tombol navigasi murni. Semantik WO-1 ("Lanjut" setelah memilih file) tercampur dengan hasil WO-2 (parse) dan WO-3 (validate) yang sudah terlanjur jalan.

**F-3 — Preview tidak punya inisiatif parsing.**
`BookImportPreviewPage` hanya membaca `validatedWorkbook` dari context. Bila kosong (deep-link `/books/import/preview` tanpa memilih file), halaman menampilkan pesan kosong dan tidak mencoba mem-parse. State halaman bergantung penuh pada side-effect halaman lain.

**F-4 — Validasi header & baris dijalankan sebelum waktunya.**
`IMP-010/011/012` (header), `IMP-013/014` (baris), dan pembentukan `canonicalRows` dieksekusi saat seleksi — padahal sesuai progres Sprint 9 itu tahap "validate" (WO-3+). Akibatnya `validationResult` sudah final sebelum preview dibuka, tanpa mekanisme re-validate.

**F-5 — Stage matching (WO-4) belum ter-wire.**
`MatchingEngineService` + `createProductionStrategies()` ada, tetapi 0 pemanggil di flow UI. Ini bukan bug, tapi mempertegas bahwa flow saat ini tidak berjalan sebagai pipeline bertahap: read+validate di seleksi, match belum punya titik panggil.

**F-6 — Race handling OK, tanpa abort.**
Guard `parseSeq` (ref) membuang hasil async basi saat user cepat mengganti file. Namun tidak ada `AbortController` — file (maks 5 MB) tetap dibaca utuh sebelum dibuang. Minor.

**F-7 — `isValid` mengabaikan `validationResult.valid`.**
Lanjut di-enable selama `errorCode === null` (error level file saja), walau workbook gagal validasi struktur/header. Bisa jadi disengaja (preview menampilkan error), namun perlu konfirmasi PO sebagai perilaku yang diinginkan.

---

## 3. Recommended Flow

```
[BooksPage]
Klik "Import Excel"
  └─ navigate('/books/import')
        └─ [BookImportPage] dropzone
              └─ User pilih file .xlsx
                    └─ selectFile(file)                       [WO-1 scope — HANYA file-level]
                          ├─ validateImportFile (IMP-001/002/003)
                          └─ setFile / setErrorCode
                              └─ TAMPIL NAMA FILE (tanpa parsing)
              └─ User klik "Lanjut" (enabled setelah file-level valid)   ← GATE transisi
                    └─ parseAndValidate()                     [WO-2 + WO-3 scope]
                          ├─ setParsing(true)
                          ├─ readWorkbook(file)   → RawWorkbook          (WO-2: parse)
                          ├─ validate(rawWorkbook) → ValidatedWorkbook   (WO-3: validate)
                          ├─ setValidatedWorkbook / setErrorCode
                          └─ setParsing(false)
                              └─ navigate('/books/import/preview')
        └─ [BookImportPreviewPage] render validatedWorkbook
              └─ [WO-4+] match(canonicalRows) → MatchedWorkbook → commit
```

Alternatif (bila parsing ingin tampil di preview):
- Parse dipicu saat **preview mount** — halaman preview punya state `parsing`/`loading` sendiri, tombol "Lanjut" murni navigasi; perlu guard deep-link (tanpa file → redirect ke `/books/import`).
- Pilihannya bergantung preferensi UX: parse saat klik (transisi lebih lambat, preview instan) vs parse saat preview (transisi instan, preview menampilkan spinner). Keduanya sesuai arsitektur bertahap; yang tidak sesuai adalah kondisi saat ini (parse saat seleksi).

---

## 4. Required Changes

Rekomendasi (TIDAK dieksekusi — mode read only):

| RC | Perubahan | File |
|----|-----------|------|
| RC-1 | Pisahkan `selectFile` menjadi: (a) validasi file-level + set state saja, (b) aksi baru `parseAndValidate()`/`continueToPreview()` yang memanggil `readWorkbook` + `validate` | `src/hooks/useBookImportWorkflow.ts` |
| RC-2 | Handler tombol "Lanjut" memanggil aksi parse (RC-1b); navigasi ke preview hanya setelah parse selesai | `src/pages/BookImportPage.tsx` |
| RC-3 | `BookImportPreviewPage` menangani state `parsing` saat transit & guard deep-link (tanpa file → redirect) | `src/pages/BookImportPreviewPage.tsx` |
| RC-4 | (Opsional) ganti kombinasi boolean (`file/errorCode/parsing/validatedWorkbook`) dengan state machine eksplisit (`idle \| file-valid \| parsing \| parsed \| error`) untuk menghilangkan kombinasi state tak valid | `src/contexts/BookImportContext.tsx` + `types/import.ts` |
| RC-5 | (WO-4 nanti) pasang `matchingEngineService` pada titik setelah preview — titik ekstensi `createProductionStrategies()` | pipeline pasca-preview |

Prinsip refactor: **pindahkan trigger, bukan tulis ulang service**. `WorkbookReaderService`, `ValidationEngineService`, `HeaderNormalizerService`, `parseSeq` guard tetap dipakai apa adanya.

---

## 5. Risk Analysis

### Jika rekomendasi diadopsi
| # | Risiko | Severitas | Mitigasi |
|---|--------|-----------|----------|
| R1 | Waktu tunggu parsing bergeser dari seleksi ke klik "Lanjut" | Rendah | Spinner parsing di halaman import saat transisi; atau parse saat preview-mount (preview menampilkan loading) |
| R2 | Deep-link `/books/import/preview` tanpa file | Rendah | Guard redirect ke `/books/import` (RC-3) |
| R3 | Perubahan perilaku tombol "Lanjut": kini enabled segera setelah file-level valid (bukan setelah parsing selesai) — perubahan UX | Medium | Perlu persetujuan PO; pertegas kontrak stage di UI |
| R4 | Race saat ganti file cepat | Rendah | Guard `parseSeq` tetap; tambahan `AbortController` opsional |
| R5 | Regresi alur valid (pilih file → Lanjut → preview) | Rendah | Smoke: file valid → Lanjut → preview benar; file ekstensi salah → error, parsing tidak jalan; deep-link tanpa file → redirect/empty |

### Jika TIDAK di-refactor
| # | Risiko | Severitas |
|---|--------|-----------|
| R6 | WO-3 (validasi header) & WO-4 (matching) sulit diposisikan sebagai stage terpisah tanpa membongkar trigger — memperumit audit WO berikutnya | Medium |
| R7 | Perilaku saat ini tetap berfungsi untuk demo end-to-end (sampai preview) — bukan blocker fungsional | Rendah |

Tidak ada perubahan database. Risiko runtime kecil. Blocker: tidak ada.

---

## 6. Recommendation

**Kesimpulan:** Flow aktual **TIDAK sesuai arsitektur Sprint 9 yang bertahap** (parse → validate → match → commit). Parsing dan validasi berjalan **sebelum waktunya** — terikat ke titik seleksi file, bukan ke titik stage-nya (transisi "Lanjut" / preview). Preview berperan sebagai konsumen pasif cache, bukan tempat pipeline berjalan.

**Rekomendasi:** Lakukan **refactor pemisahan trigger** — seleksi file hanya menjalankan validasi file-level (WO-1); klik "Lanjut" (atau preview mount) yang memicu `readWorkbook` (WO-2) lalu `validate` (WO-3); matching (WO-4) dipasang setelah preview. Service layer yang ada tidak perlu ditulis ulang — cukup memindahkan titik panggil (RC-1..RC-3).

**Prioritas:** **Medium** — bukan blocker fungsional (flow saat ini bekerja end-to-end sampai preview), tetapi memblokir penempatan stage WO-3/WO-4 secara bersih bila dibiarkan.

**Verifikasi pasca-refactor (bila diadopsi):** `npm run lint` + `npm run build` hijau; smoke: (1) file valid → Lanjut → preview menampilkan data; (2) file ekstensi salah → pesan error, parsing tidak berjalan; (3) file valid-struktur-valid → preview; (4) file valid-ekstensi-gagal-struktur → Lanjut tetap bisa membuka preview yang menampilkan error (perlu konfirmasi perilaku F-7); (5) deep-link preview tanpa file → redirect/empty state.

---

**Status: READY untuk review.** Mode read only — tidak ada perubahan kode. Menunggu keputusan Product Owner.
