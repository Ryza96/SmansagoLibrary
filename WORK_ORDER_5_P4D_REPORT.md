# WORK ORDER 5 — P4D REPORT — IPC Integration

## Objective
Menghubungkan `MemberImportService` (P4B/P4C, APPROVED) ke Electron IPC sesuai `MEMBER_IMPORT_SERVICE_ARCHITECTURE_RFC.md` §11.2. Scope **HANYA IPC**: handler `members:previewCheck` + `members:import`, forwarding progress `members:importProgress` main→renderer, DTO diteruskan tanpa transformasi, error sistem tetap throw sedangkan business error tetap ResultDTO. **TANPA perubahan UI / dialog import / komponen renderer.**

## Files Modified

| File | Perubahan |
|------|-----------|
| `electron/ipc/member.ipc.ts` | `registerMemberHandlers(memberService, memberImportService)` — 2 handler baru: `members:previewCheck` (→ `memberImportService.previewCheck(rows)`), `members:import` (→ `memberImportService.import(rows, { onProgress: (p) => event.sender.send('members:importProgress', p) })`). Handler `members:downloadTemplate` dst. tidak berubah. |
| `electron/ipc/index.ts` | Tambah `memberImportService: MemberImportService` ke tipe parameter `services`; `registerMemberHandlers(services.memberService, services.memberImportService)`. |
| `electron/main/bootstrap.ts` | DI per RFC §7.1: `MemberDuplicateChecker(newMemberRepository)`, `MemberClassResolver(academicYearRepository, classRepository)`, `MemberImportService(duplicateChecker, classResolver, numberGeneratorService, newMemberRepository)`; tambah `memberImportService` ke `Container`. |
| `electron/preload/member.preload.ts` | `memberImport.previewCheck(rows)` → `invoke('members:previewCheck', rows)`; `memberImport.import(rows)` → `invoke('members:import', rows)`; `memberImport.onProgress(cb)` → `ipcRenderer.on('members:importProgress', …)` mengembalikan unsubscribe (`removeListener`). |
| `src/renderer/env.d.ts` | Tipe 3 method `memberImport` (`previewCheck`, `import`, `onProgress`) merujuk DTO `src/shared/dto/member`. |

**TIDAK diubah:** komponen renderer (dialog import, pages), `MemberImportService` (public API P4B/P4C tetap), schema/migrasi, service P1/P2/P3, `registerAllHandlers` lainnya.

## IPC Contract

| Channel | Arah | Request → Response |
|---------|------|--------------------|
| `members:previewCheck` | renderer→main (invoke) | `MemberImportRowInput[]` → `MemberImportPreviewDTO` (passthrough, tanpa transformasi) |
| `members:import` | renderer→main (invoke) | `MemberImportRowInput[]` → `MemberImportResultDTO` (passthrough, tanpa transformasi) |
| `members:importProgress` | main→renderer (send, satu arah) | `MemberImportProgressEvent` dikirim DARI DALAM `MemberImportService.import` lewat `onProgress` yang di-inject IPC |

Semantik error (RFC §3.2 / §9, dipertahankan di lapisan IPC):
- **Business error** (preflight blocker, P2002 saat commit, single-flight) → handler **resolve** dengan `MemberImportResultDTO { success:false, … }` (tidak throw).
- **System error** (DB down/timeout, dll.) → handler **reject** (propagasi error asli, tanpa dibungkus ResultDTO).

## Event Flow
```
Renderer
  memberImport.import(rows)
     │ invoke('members:import')
     ▼
  ipcMain.handle('members:import')
     │ memberImportService.import(rows, {
     │   onProgress: (p) => event.sender.send('members:importProgress', p)
     │ })
     ▼
  MemberImportService.import
     • preparing
     • checking-duplicate (preflight)
     • resolving-class (preflight)
     • generating-number (dalam $transaction)
     • completed
     ▼ (setiap stage) sender.send('members:importProgress', event)
     ▼
  Renderer menerima via memberImport.onProgress(cb)  → unsubscribe() untuk melepas listener
```

## Validation

### Smoke `uat_wo5_p4d/ipc-contract.smoke.ts` — 25/25 PASS
Harness: fresh temp DB (`prisma migrate deploy` 3 migration), require-hook `Module._load` memmock modul `electron` (`ipcMain.handle` menangkap handler; `app`/`dialog`/`BrowserWindow` stub) → load `electron/ipc/member.ipc.ts` hasil compile → `registerMemberHandlers` → jalankan handler terdaftar dengan event tiruan (`sender.send` menangkap channel+payload).

| Test | Hasil |
|------|-------|
| T1 handler `members:previewCheck`, `members:import`, `members:downloadTemplate` terdaftar | PASS |
| T2 preview via IPC → `valid:false`, `classNotFound`, DTO identik dengan `service.previewCheck` (passthrough) | PASS |
| T3 import via IPC sukses → `success:true, created:2`, tulis DB (`S-000001..S-000002`, field mapping), DTO identik dengan `service.import` (tanpa `durationMs`), progress 7 event semua via `members:importProgress`, semua stage terkirim, terakhir `completed current===total` | PASS |
| T4 business error (NISN duplikat DB) via IPC → **tidak throw**, `success:false`, `duplicateNisnInDb`, `created:0` | PASS |
| T5 system error (service dengan repo `createManyWithTx` throw `database is down`) via IPC → **THROW** `database is down`, hasil tanpa properti `.success`, rollback (0 baris tersisa) | PASS |

### Regression
- `npm run lint` PASS (tsc node + web).
- `npm run build` PASS — `out/main/index.js` 1,774.00 kB, `out/preload/index.js` 7.68 kB, `out/renderer` 925.16 kB.
- Grep artifact: `out/main/index.js` memuat `members:previewCheck`, `members:import`, `onProgress: … event.sender.send("members:importProgress", …)`; `out/preload/index.js` memuat `previewCheck`/`import`/`onProgress` + listener `members:importProgress`.
- Renderer UI/dialog **tidak** disentuh (tidak ada file `src/components`/`src/pages` berubah).

## Compatibility
- Public API `MemberImportService` sama persis RFC (`isImportRunning`, `previewCheck(rows)`, `import(rows, { onProgress? })`) — P4D hanya menambah konsumen IPC.
- Wiring DI mengikuti RFC §7.1 dengan service/repository yang sudah ada di bootstrap (tidak ada instansiasi ganda `PrismaClient`, `NumberGeneratorService` dipakai bersama `MemberService` dan `MemberImportService`).
- `memberImport.onProgress` mengikuti pola subscribe/return-unsubscribe (bukan subscribe permanen) → aman bila renderer subscribe lebih dari sekali / unmount.
- Siap untuk P5/P6 (UI): renderer cukup memanggil `window.electronAPI.memberImport.previewCheck/import` dan subscribe `onProgress`.

## Status
**DONE — berhenti, menunggu review Product Owner.** Tidak ada commit, tidak ada perubahan UI. (Laporan ini + 5 file modifikasi + `uat_wo5_p4d/ipc-contract.smoke.ts` di working tree, belum di-commit.)
