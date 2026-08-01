# SPRINT9 — WO-4.1 Implementation Report
**Matching Runtime Wiring** — menghubungkan Matching Engine ke pipeline produksi via IPC.

## 1. Ringkasan
WO-4.1 menghubungkan `MatchingEngineService` (yang selama ini **0 pemanggil** di produksi) ke main process
melalui komposisi bootstrap + handler IPC `imports:match`. Renderer cukup mengirim `canonicalRows[]`;
main process menjalankan `MatchingEngine → createProductionStrategies()` dan mengembalikan `MatchedWorkbook`.
**Tidak ada perubahan** pada algoritma matching, strategy, repository, kebijakan AMBIGUOUS, WorkbookReader,
maupun Validation Engine.

## 2. Perubahan Kode

### File baru
| File | Isi |
|------|-----|
| `electron/ipc/book-import.ipc.ts` | `registerBookImportHandlers(engine)` mendaftarkan channel `imports:match`. Penerima `canonicalRows: CanonicalRow[]`, dibungkus `toValidatedWorkbook()` (stub minimal), lalu `engine.match(...)`. |
| `electron/preload/book-import.preload.ts` | `bookImportAPI.imports.match(canonicalRows)` → `ipcRenderer.invoke('imports:match', canonicalRows)`. |

### File dimodifikasi
| File | Perubahan |
|------|-----------|
| `electron/ipc/index.ts` | Type `matchingEngine: MatchingEngineService` ditambahkan ke signature; `registerBookImportHandlers(services.matchingEngine)` dipanggil. |
| `electron/main/bootstrap.ts` | `const matchingEngine = new MatchingEngineService(createProductionStrategies())` ditambahkan ke `Container` (interface + return). |
| `electron/preload/index.ts` | Spread `...bookImportAPI` ditambahkan ke agregasi `electronAPI`. |
| `src/renderer/env.d.ts` | Blok `imports: { match: (canonicalRows) => Promise<MatchedWorkbook> }` ditambahkan ke `ElectronAPI`. |
| `tsconfig.node.json` | Menambahkan 5 file engine ke `include` (lihat §3.2). |

## 3. Detail Teknis

### 3.1 Alur runtime
```
renderer (window.electronAPI.imports.match(canonicalRows))
  → preload  (ipcRenderer.invoke('imports:match', canonicalRows))
  → main IPC (registerBookImportHandlers)
  → toValidatedWorkbook(canonicalRows)   // stub: engine hanya baca .canonicalRows
  → MatchingEngineService.match(...)
  → createProductionStrategies()          // ExactBook / ContainsAuthor / ContainsPublisher / ContainsCategory (Prisma)
  → MatchedWorkbook                       // dipakai pada masalah status: engine atur status per field
  → renderer (Promise<MatchedWorkbook>)
```

### 3.2 Batas kompilasi (composite project)
`MatchingEngineService` berada di `src/services/` (konteks web). Agar bisa dikonsumsi main process,
graf impor engine ditambahkan ke `include` `tsconfig.node.json`:
`MatchingEngineService.ts`, `DummyMatchStrategies.ts`, `DummyMatchProviders.ts`, `MatchProviders.ts`,
`src/types/import.ts`. Tanpa itu `tsc` node gagal `TS6307` (composite menolak file di luar include).
Tidak ada isi file yang diubah — hanya pendaftaran di konfigurasi.

### 3.3 Adaptor `toValidatedWorkbook`
`MatchingEngineService.match()` menerima `ValidatedWorkbook`; WO-4.1 mensyaratkan renderer hanya kirim
`canonicalRows`. Adaptor membuat stub `ValidatedWorkbook` dengan field kosong aman:
`rawWorkbook.sheets=[]`, `normalizedHeaders=[]`, `rowResults=[]`, `validationResult` valid kosong.
Engine terbukti hanya membaca `validatedWorkbook.canonicalRows` (`MatchingEngineService.ts:17`),
sehingga stub aman dan tidak mengubah kontrak engine.

## 4. Verifikasi
| Gate | Hasil |
|------|-------|
| `npm run lint` (node + web `tsc --noEmit`) | PASS |
| `npm run build` (electron-vite build) | PASS (main 105.9 kB, preload 6.51 kB, renderer 882.8 kB) |
| Smoke handler body (fresh DB, 17 kasus) | PASS 17/17 |

Kasus smoke yang diuji (skrip sementara `scripts/smoke-wo41-match-ipc.ts`, dihapus setelah selesai):
- Row lengkap → `isbn/authors/publisher/category` semua **FOUND**, provider `prisma-*`, kandidat benar.
- Nilai tak dikenal → semua **NOT_FOUND**.
- `null` / string kosong / whitespace / `undefined` → semua **SKIPPED**.
- Dua author mengandung "Andrea" → **AMBIGUOUS** dengan 2 kandidat.

DB uji = fresh SQLite temp (`prisma migrate deploy`), dibersihkan setelah smoke; DB dev tidak disentuh.

## 5. Status
**READY.** WO-4.1 selesai, sesuai kriteria acceptance (lihat Architecture Checklist). Menunggu review PO.
