# WORK ORDER P-4 — PROMOTION OPERATOR UI — IMPLEMENTATION REPORT

## 1. TUJUAN
WO P-4 "Promotion Operator UI" (APPROVED — READY FOR IMPLEMENTATION): menyelesaikan **workflow operator** untuk menjalankan Promotion melalui antarmuka aplikasi, sesuai Business Flow: pilih tahun sumber → pilih tahun tujuan → pilih kelas sumber (opsional) → Preview → lihat hasil → Execute → otomatis menuju Detail Promotion Run.

## 2. SCOPE
| Layer | Status |
|-------|--------|
| `electron/ipc/promotion.ipc.ts` | DIMODIFIKASI: +`promotions:preview` (→ `PromotionPreviewService.preview`), +`promotions:execute` (→ `PromotionExecuteService.executeAutomatic`); signature berubah menjadi objek `{runService, previewService, executeService}` |
| `electron/preload/promotion.preload.ts` | DIMODIFIKASI: +`promotions.preview` / `promotions.execute` |
| `electron/ipc/index.ts`, `electron/main/bootstrap.ts` | WIRING: instantiasi `PromotionPreviewService` + `PromotionExecuteService` + registrasi handler |
| `src/renderer/env.d.ts` | DITAMBAH: `promotions.preview` / `promotions.execute` (DTO shared) |
| `src/pages/promotion/PromotionPage.tsx` | BARU: halaman operator (form tahun/kelas + Preview + hasil + Execute + redirect) |
| `src/routes/index.tsx` | +route `/promotions/run` |
| `src/components/layout/Sidebar.tsx` | +menu "Promosi" (ikon `PlayCircle`) di atas "Riwayat Promosi" |
| `src/utils/navigation.ts` | +`ROUTES.PROMOTION_RUN` |
| `src/utils/labels.ts` | +blok `PROMOTION_OPERATOR` |
| `p4_operator_ui_smoke/smoke.ts` | BARU: smoke 37/37 |

**TIDAK DIUBAH:** `decide()`, `PromotionPreviewService`, `PromotionExecuteService`, `EnrollmentService`, business rule promosi, `schema.prisma`, migration. Service hanya **di-instantiasi & dipanggil** lewat IPC — tidak ada modifikasi logic.

## 3. KEPUTUSAN IMPLEMENTASI
1. **Renderer HANYA menampilkan hasil** — `PromotionPage` tidak punya logika keputusan: payload `{mode:'AUTOMATIC', fromYearId, toYearId, fromClassId?}` diteruskan apa adanya ke `promotions:preview` / `promotions:execute`. `fromClassId` di-omit bila operator memilih "Semua Kelas" (kontrak service: dariClassId opsional = seluruh kelas tahun sumber). Mode `AUTOMATIC` adalah konstanta kontrak (satu-satunya mode yang didukung P-1/P-2), bukan business rule.
2. **Preview WAJIB `PromotionPreviewService`** — channel `promotions:preview` memanggil `previewService.preview(input)` → `decide()` (engine tunggal P-1). Execute WAJIB `PromotionExecuteService` — channel `promotions:execute` memanggil `executeService.executeAutomatic(input)` (satu transaksi all-or-nothing, re-validate, audit run). IPC = penerus murni, tanpa logika.
3. **Redirect ke Detail Promotion Run** — setelah execute sukses, renderer `navigate(promotionDetailPath(run.id))` → halaman `PromotionRunDetailPage` (P-3). Preview == Execute dijamin engine tunggal `decide()` (dibuktikan smoke item-identik).
4. **UI dropdown data dari API existing** — tahun dari `academicYears.findMany()`, kelas dari `classes.findMany()` fetch-all (limit 100 loop) lalu filter client-side per tahun sumber (filter UI murni, bukan keputusan akademik). Default tahun sumber = tahun aktif.
5. **Error AppError → alert(err.message)** — guard (tahun sama / tidak ada / kelas bukan milik tahun sumber) dilempar service sebagai `AppError`; renderer menampilkan `err.message` (pola existing), tanpa derifasi sendiri.

## 4. VALIDATION
| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS — main 1,817.22 kB · preload 9.02 kB · renderer 1,045.33 kB |
| Smoke P-4 (fresh DB) | **37/37 PASS** |
| Regression 13 suite (fresh DB) | p1-decide 30 · p1-preview 33 · p2-execute 87 · p3-history 75 · **p4-operator 37** · e1 39 · e2 36 · e3 78 · e4 45 · mi1 43 · mi2 37 · mi3 38 · mi4 24 → **total 602 PASS, 0 FAIL** |
| `prisma migrate diff` | "No difference detected" (schema tidak disentuh) |
| Grep bundle | main `promotions:preview`/`promotions:execute` True; preload True; renderer `Eksekusi Promosi`/`Tahun Ajaran Sumber`/`Semua Kelas` True |
| Grep "business rule di renderer" | 0 (satu-satunya match = komentar `decide()` di header file — bukan logika) |

## 5. SMOKE P-4 (37/37) — APA YANG DIBUKTIKAN
- Alur operator end-to-end dengan **payload PERSIS yang dikirim UI**: Preview semua kelas → Preview satu kelas (`fromClassId`) → Execute → Detail run (`findById`) → run muncul di riwayat (`findMany`).
- **Preview == Execute**: item per item `outcome` + `targetClassId` identik; `run.summary == preview.counts`.
- Detail menampilkan label dari relasi (`memberName`, dsb.) — kontrak halaman Detail (P-3).
- Guard service → `AppError` (404/400) yang UI tampilkan sebagai `err.message`.
- Execute ulang = state-based: hanya sisa ACTIVE (NO_TARGET) diproses, tanpa duplikasi.

## 6. FILE
```
src/pages/promotion/PromotionPage.tsx         (baru)
p4_operator_ui_smoke/smoke.ts                 (baru)
```
plus modifikasi: `promotion.ipc.ts`, `promotion.preload.ts`, `ipc/index.ts`, `bootstrap.ts`, `env.d.ts`, `routes/index.tsx`, `Sidebar.tsx`, `navigation.ts`, `labels.ts`.

## 7. CATATAN / TECHNICAL DEBT
- Tidak ada identitas operator (belum ada auth) → `runBy` tidak dikirim UI (audit run tetap tercatat via `startedAt`/`mode`; `runBy` null). Bila nanti ada login, tinggal isi `runBy`.
- `PromotionPage` menduplikasi fetch-all loop kelas (`classes.findMany` limit 100) — pola sama `ClassListPage`; bila IPC `classes:findMany` dikembangkan filter per tahun, loop bisa disederhanakan.
