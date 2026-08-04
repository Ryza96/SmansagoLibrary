# WORK ORDER P-3 — PROMOTION RUN HISTORY — IMPLEMENTATION REPORT

## 1. TUJUAN
WO P-3 "Promotion Run History" (APPROVED — READY FOR IMPLEMENTATION): menghadirkan **riwayat Promotion Run yang sudah dieksekusi** sebagai halaman READ-ONLY di aplikasi. Seluruh data history **hanya berasal dari `PromotionRun` + `PromotionRunItem`** (audit) — **DILARANG** menghitung ulang keputusan via `decide()` (history = audit, bukan preview).

## 2. SCOPE
| Layer | Status |
|-------|--------|
| `src/shared/dto/promotion.ts` | DITAMBAH: `PromotionRunSummaryCounts`, `PromotionRunListItemDTO`; `PromotionRunDTO`/`PromotionRunItemDTO` diperluas (label display) |
| `src/main/repositories/promotion.repository.ts` | DIMODIFIKASI: `findById` + include `fromYear`/`toYear`/`member` + batch label kelas; `findMany` + include tahun |
| `src/main/services/promotion-run.service.ts` | DIMODIFIKASI: mapping audit ke `PromotionRunDTO`/`PromotionRunListItemDTO` (READ-ONLY) |
| `electron/ipc/promotion.ipc.ts` | BARU: `promotions:findMany`, `promotions:findById` |
| `electron/preload/promotion.preload.ts` | BARU: `promotions.*` |
| `electron/ipc/index.ts`, `electron/main/bootstrap.ts`, `electron/preload/index.ts` | WIRING registrasi |
| `src/renderer/env.d.ts` | DITAMBAH: blok `promotions` |
| `src/utils/navigation.ts`, `src/utils/labels.ts`, `src/components/layout/Sidebar.tsx`, `src/routes/index.tsx` | DITAMBAH: route `/promotions` + `/promotions/:id`, menu "Riwayat Promosi", label blok `PROMOTION` |
| `src/pages/promotion/PromotionHistoryPage.tsx` | BARU: list history (13 kolom) |
| `src/pages/promotion/PromotionRunDetailPage.tsx` | BARU: detail run + summary counts + tabel item |
| `p3_promotion_history_smoke/smoke.ts` | BARU: smoke 75/75 |

**TIDAK DIUBAH:** `decide()` (`promotion-preview.service.ts`), `PromotionExecuteService`, `EnrollmentService`, business rule promosi, `schema.prisma`, migration.

## 3. KEPUTUSAN IMPLEMENTASI
1. **History READ ONLY** — `PromotionRunService.findById/findMany` hanya membaca `PromotionRun`/`PromotionRunItem` (via repository). Tidak ada pemanggilan `decide()`, tidak ada kalkulasi turunan kecuali mapping label display.
2. **8 kolom counts** sesuai Business Rule PO (Promoted, Graduated, Repeated, Redistributed, Transferred, Dropped, No Target, Error) — `PromotionRunSummaryCounts`. Nilai BERASAL dari kolom `summary` (JSON counts yang ditulis P-2 saat eksekusi). `transferred`/`dropped` default **0** untuk run AUTOMATIC (status akademik tsb tidak diproduksi Mode A); nilai hanya terisi bila mode lain menuliskannya ke summary. **TIDAK menambah kolom schema.**
3. **Label display dari relasi, bukan recompute:**
   - `memberName` → `items.member.fullName` (relation member, sudah ada).
   - `sourceClassLabel`/`targetClassLabel` → batch lookup `class` via `in: classIds` lalu map `"${educationLevel} ${parallel}"`. `PromotionRunItem` TIDAK punya relation ke `Class`; label diambil batch (dilarang query per baris), label kelas **hanya display** — keputusan tetaplah `outcome`/`targetClassId` yang ditulis P-2.
   - `fromYearName`/`toYearName` → relation `fromYear`/`toYear` (sudah ada).
4. **IPC baru tanpa breaking change** — channel baru `promotions:findMany`/`promotions:findById`; preload baru; `bootstrap.ts` meng-instantiasi `PromotionRepository` + `PromotionRunService` (sebelumnya TIDAK ter-wire karena P-2 di-trim IPC).
5. **UI konsisten pola existing** — list memakai tabel langsung (bukan `MasterTable`, karena history READ-ONLY tanpa aksi add/edit/delete); detail meniru `EnrollmentHistoryPage` (header breadcrumb, badge status/outcome, format tanggal `id-ID`).

## 4. VALIDATION
| Gate | Hasil |
|------|-------|
| `npm run lint` (tsc node+web) | PASS |
| `npm run build` | PASS — main 1,805.61 kB · preload 8.86 kB · renderer 1,028.69 kB |
| Smoke P-3 (fresh DB) | **75/75 PASS** |
| Regression 12 suite (fresh DB) | p1-decide 30 · p1-preview 33 · p2-execute 87 · **p3-history 75** · e1 39 · e2 36 · e3 78 · e4 45 · mi1 43 · mi2 37 · mi3 38 · mi4 24 → **total 565 PASS, 0 FAIL** |
| `prisma migrate diff` | "No difference detected" (schema tidak disentuh) |
| Grep bundle | main `promotions:findMany`/`promotions:findById` True; preload `promotions.findMany` True; renderer `Riwayat Promosi`/`Detail Run Promosi` True |

## 5. SMOKE P-3 (75/75) — APA YANG DIBUKTIKAN
- **A.** `findMany` list = data `PromotionRun` (bukan recompute): tahun dari relasi, counts 8 kolom (transferred/dropped = 0 default), `itemCount` dari `_count.items`, status/mode/runBy, urutan `startedAt desc`, pagination/limit.
- **B.** `findById` detail = run + items lengkap: `memberName`/`sourceClassLabel`/`targetClassLabel` dari relasi (dibuktikan nilai persis "Andi Kelas X", "X MERDEKA 1", "XI MERDEKA 1"), `outcome`, `message` untuk NO_TARGET.
- **C.** Konsistensi audit: groupBy outcome di `PromotionRunItem` == counts yang dilaporkan history.
- **D.** Guard 404 (`AppError` statusCode 404).
- **E.** Run kedua → daftar 2 run, urutan terbaru dulu; itemCount & counts per run tetap (run1 = 5 item, run2 = 2 item: sX3 PROMOTED + sNoTarget NO_TARGET).

## 6. FILE
```
elektron/ipc/promotion.ipc.ts            (baru)
electron/preload/promotion.preload.ts    (baru)
src/pages/promotion/PromotionHistoryPage.tsx   (baru)
src/pages/promotion/PromotionRunDetailPage.tsx (baru)
p3_promotion_history_smoke/smoke.ts      (baru)
```
plus modifikasi: `promotion.ts`, `promotion.repository.ts`, `promotion-run.service.ts`, `ipc/index.ts`, `preload/index.ts`, `bootstrap.ts`, `env.d.ts`, `navigation.ts`, `labels.ts`, `Sidebar.tsx`, `routes/index.tsx`.

## 7. CATATAN / TEKNICAL DEBT
- `PromotionRunItem` tidak punya relation ke `Class` → label kelas via batch lookup di repository. Bila data banyak, alternatif lebih baik adalah menyimpan label saat eksekusi (kolom) — di luar scope P-3.
- Label `STATUS_SUCCCESS` typo diperbaiki menjadi `STATUS_SUCCESS` saat menambah blok `PROMOTION`.
