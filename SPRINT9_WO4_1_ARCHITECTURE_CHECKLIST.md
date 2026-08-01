# SPRINT9 — WO-4.1 Architecture Checklist
**Matching Runtime Wiring**

## Acceptance Criteria WO-4.1
| # | Kriteria | Status | Bukti |
|---|----------|--------|-------|
| 1 | Runtime entry point matching di main process | ✅ | `electron/main/bootstrap.ts` (komposisi `MatchingEngineService(createProductionStrategies())`) + `electron/ipc/book-import.ipc.ts` (`ipcMain.handle('imports:match', ...)`) |
| 2 | Pakai `createProductionStrategies()` sebagai wiring produksi | ✅ | `bootstrap.ts:34` — instance engine dibuat dengan production strategies (bukan default dummy) |
| 3 | Expose IPC (mis. `imports:match`) | ✅ | Channel `imports:match` terdaftar; tidak ada konflik channel lain (grep `imports:` → hanya file baru) |
| 4 | Renderer hanya kirim `canonicalRows` | ✅ | Preload `book-import.preload.ts` hanya menerima `CanonicalRow[]`; renderer tidak perlu mengirim RawWorkbook/ValidatedWorkbook |
| 5 | Main: canonicalRows → MatchingEngine → Production Strategies → MatchedWorkbook → renderer | ✅ | Alur terbukti via smoke (17 kasus PASS); tipe pengembalian `Promise<MatchedWorkbook>` di `env.d.ts` |

## Batasan (TIDAK diubah)
| Batasan | Status | Bukti |
|---------|--------|-------|
| Strategy (algoritma findMatches) | ✅ Tidak diubah | `src/services/strategies/*`, `src/main/strategies/index.ts` tak tersentuh |
| Repository | ✅ Tidak diubah | `src/main/repositories/*` tak tersentuh |
| Algoritma Matching (status rule) | ✅ Tidak diubah | `MatchingEngineService.ts` tak tersentuh |
| Kebijakan AMBIGUOUS / scoring | ✅ Tidak diubah | — |
| WorkbookReader | ✅ Tidak diubah | — |
| Validation Engine | ✅ Tidak diubah | `ValidationEngineService.ts` tak tersentuh |
| Penggantian dummy → produksi di layer lain | ✅ Tidak dilakukan | Hanya instance main-process yang memakai produksi; singleton `matchingEngineService` (dummy) di renderer tetap ada |

## Arsitektur setelah WO-4.1
```
Renderer (web tsconfig)
  BookImportPreviewPage (belum konsumsi — WO lanjutan)
    → window.electronAPI.imports.match(canonicalRows)   [env.d.ts typed]
Preload
  book-import.preload.ts  ipcRenderer.invoke('imports:match', canonicalRows)
Main
  book-import.ipc.ts      ipcMain.handle → toValidatedWorkbook → engine.match
  bootstrap.ts            MatchingEngineService(createProductionStrategies())
  strategies/index.ts     [UNCHANGED] production composition root
  providers/*             [UNCHANGED] Prisma providers via repositories
Engine (src/services, web context — kini juga masuk node tsconfig)
  MatchingEngineService   [UNCHANGED] read-only .canonicalRows, status rule
```

## Konvensi terpenuhi
- Channel `domain:action` (`imports:match`) sesuai pola `borrowings:create`, `returns:returnBook`, dst.
- DI via `bootstrap.ts` Container → `registerAllHandlers(services, mainWindow)` — konsisten dengan seluruh domain.
- Preload diagregasi via `index.ts`; deklarasi tipe global di `env.d.ts`.
- Import engine di proyek node memakai path `../../src/...` seperti service baru lain (`src/main/services`).

## Verifikasi
- `npm run lint` ✅ · `npm run build` ✅ · Smoke handler body 17/17 ✅ (DB temp, dibersihkan).
