# WORK_ORDER_P2_IMPLEMENTATION_REPORT

- **WO:** P-2 — Promotion Execute (RFC §7A, §9)
- **Status:** IMPLEMENTED — READY Final Review
- **Source of Truth:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, §7/§7.1/§8/§9) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-22 P-2) + `P2_DISCOVERY_REPORT.md` (APPROVED)
- **Keputusan arsitektur PO:** `decide()` P-1 = **Single Decision Engine**. P-2 WAJIB memakai fungsi yang sama — TIDAK ada logika keputusan kedua; eksekusi satu transaksi all-or-nothing.

---

## 1. Scope yang dikerjakan

| Deliverable WBS | File | Keterangan |
|-----------------|------|------------|
| Executor | `src/main/services/promotion-execute.service.ts` (BARU) | `PromotionExecuteService.executeAutomatic()` — SATU `$transaction` all-or-nothing (RFC §7A) |
| Run/Audit Service | `src/main/services/promotion-run.service.ts` (BARU) | `PromotionRunService.findById/findMany` — audit read-only (RFC §2.2/§9) |
| Repository | `src/main/repositories/promotion.repository.ts` (BARU) | `createRunWithTx` (tulis run+items di dalam tx service), `findById`, `findMany` |
| DTO | `src/shared/dto/promotion.ts` (+3 type) | `AutomaticPromotionExecuteInput`, `PromotionRunDTO`, `PromotionRunItemDTO`, `PromotionRunStatus` |
| Repository tx support | `src/main/repositories/enrollment.repository.ts` (+3) | `findActiveByClassesWithTx`, `closeWithTx`, `createActiveWithTx` |
| Repository tx support | `src/main/repositories/class.repository.ts` (+1) | `findByAcademicYearWithTx` |
| Repository tx support | `src/main/repositories/member.repository.ts` (+1) | `updateStatusWithTx` (RFC §4.3) |
| Smoke | `p2_execute_smoke/smoke.ts` (BARU) | 87/87 PASS (fresh DB) |

**TIDAK diubah (keputusan PO "JANGAN"):** IPC (`promotions:run` WBS di-trim), Preload, UI, Reporting, Bulk Operation, Schema, Migration, Bootstrap, env.d.ts.

## 2. Layer per WBS §3 (auditability)

| Layer | Status | Catatan |
|-------|--------|---------|
| Repository | **DONE** | `PromotionRepository` + 5 metode tx pendukung di repo existing (pola `createManyWithTx`/`findLastMemberNumberByPrefix(tx)`) |
| Service | **DONE** | `PromotionExecuteService` (transaksi + orkestrasi) + `PromotionRunService` (audit read) |
| IPC | **N/A** | JANGAN (per keputusan PO) — WBS `promotions:run` di-trim PO |
| Preload | **N/A** | JANGAN (per keputusan PO) |
| UI | **N/A** | JANGAN (per keputusan PO) |
| Testing | **DONE** | Smoke 87/87 + Regression 10 suite (lihat §5) |
| PO Review | **PENDING** | — |

## 3. Detail implementasi

### 3.1 `PromotionExecuteService.executeAutomatic()` — SATU transaksi all-or-nothing

Urutan dalam `runTransaction(getPrisma(), ...)` (RFC §7.1/§7A):

1. **Validasi input** (di luar tx): mode `AUTOMATIC` (MAPPING/BULK_EDIT → 400), tahun sumber/target ada (404), tahun ≠ (400), `fromClassId` opsional + milik tahun sumber (400).
2. **Re-validate state TERBARU di dalam `$transaction` (RFC §7.1/§8):** baca ulang enrollment ACTIVE sumber (`EnrollmentRepository.findActiveByClassesWithTx`) + kelas kandidat target (`ClassRepository.findByAcademicYearWithTx`). Hanya state aktif yang diproses — **keputusan basi tidak pernah dieksekusi**.
3. **Keputusan via `decide()` P-1** (import dari `promotion-preview.service.ts`) — fungsi SAMA dengan preview (Preview == Execute, engine tunggal). `repeat: false` (Mode A murni).
4. **Tulis mutasi enrollment per item:**
   - `PROMOTED`/`REPEATED`: `closeWithTx` (terminal + `leftAt`) → `updateStatusWithTx` (RFC §4.3 → ACTIVE) → `createActiveWithTx` (kelas target, tahun target).
   - `GRADUATED`: `closeWithTx` (GRADUATED) → `updateStatusWithTx` (INACTIVE).
   - `NO_TARGET`/`ERROR`/`REDISTRIBUTED`: **tanpa mutasi** — enrollment sumber tetap ACTIVE (RFC §9 state-based eligibility, retry-able).
5. **Audit:** `PromotionRepository.createRunWithTx` — satu `PromotionRun` (`status=SUCCESS`, `summary=JSON(counts)`, `runBy`, `startedAt/finishedAt`) + seluruh `PromotionRunItem` (`outcome`, `targetClassId`, `message`).
6. **Return `PromotionRunDTO`** via `PromotionRunService.findById(runId)`.

**All-or-nothing:** exception apa pun di dalam `$transaction` (termasuk di tengah mutasi) = rollback penuh — dibuktikan smoke STEP 7 (injeksi kegagalan setelah close+create → 0 run, 0 item, enrollment & member.status tidak berubah).

### 3.2 `EnrollmentService` — "bila diperlukan" = TIDAK dipakai untuk menulis

`EnrollmentService.close/enroll` tidak dapat ikut dalam transaksi eksekusi (masing-masing membuka transaksinya sendiri; Prisma interaktif tidak bisa nested). P-2 menulis enrollment via metode tx **repository** (`closeWithTx`/`createActiveWithTx`) dengan business rule SAMA (terminal status + leftAt; ACTIVE baru; invarian satu-ACTIVE dijaga karena sumber ditutup pada transaksi yang sama sebelum dibuka yang baru). Nilai status terminal dihitung service via `ACADEMIC_STATUS` + `memberStatusForTerminalAcademic` (config F1) — tidak ada literalan status baru.

### 3.3 `PromotionRunService` — audit read-only

- `findById(id)` → `PromotionRunDTO` (run + items, `summary` di-parse dari JSON, 404 bila tidak ada).
- `findMany({page, limit})` → daftar run terbaru + `itemCount` (ringkas, tanpa items).

## 4. Keputusan teknis (bukan keputusan PO)

1. **Transaksi di-orkestrasi service; repository menerima `tx`** — konsisten pola existing (`createManyWithTx`, `findLastMemberNumberByPrefix(tx)`) dan keputusan Review PO P-1 (Service TIDAK akses Prisma langsung; seluruh akses data lewat Repository). `getPrisma()` hanya untuk membungkus `runTransaction`.
2. **`closeWithTx` menerima `note` wajib** — catatan audit "Promosi otomatis {from} → {to}" di tiap mutasi (RFC §9 audit).
3. **`updateStatusWithTx` ditulis selalu** (bukan conditional) — idempoten; nilai dihitung dari config `memberStatusForTerminalAcademic`.
4. **`summary` disimpan sebagai JSON string counts** (`PromotionPreviewCounts`) — mirror preview; `PromotionRunService` mem-parse untuk DTO. Tidak ada derivasi di renderer (konsisten keputusan WO-2: summary hanya dari backend).
5. **Mode di-execute dikunci AUTOMATIC** — MAPPING/BULK_EDIT → 400 (P-3/P-5); konsisten keputusan P-1.
6. **`PromotionRun.status` P-2 selalu `SUCCESS`** — karena kegagalan = rollback penuh; PARTIAL/FAILED untuk mode lain / P-4.

## 5. Validation

| Gate | Hasil |
|------|-------|
| Smoke P-2 (fresh DB) | **87/87 PASS** — lihat peta smoke §6 |
| Unit decide (P-1) | 30/30 PASS |
| Smoke preview (P-1, fresh DB) | 33/33 PASS |
| Regression | E-1 **39** · E-2 **36** · E-3 **78** · E-4 **45** · MI-1 **43** · MI-2 **37** · MI-3 **38** · MI-4 **24** — semua PASS (fresh DB per suite) |
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,799.72 kB · preload 8.62 kB · renderer 1,006.72 kB — preload/renderer tidak berubah = N/A layer lain) |
| `prisma migrate diff` | = empty migration (schema tidak disentuh) |
| Grep `promotions:`/execute/run di renderer+electron | 0 match → tidak ada wiring IPC/preload/bootstrap/UI |

## 6. Peta smoke P-2 (87/87)

| STEP | Bukti |
|------|-------|
| 0 | seed 6 enrollment (5 ACTIVE + 1 DROPPED) |
| 1 | Preview Mode A baseline: promoted 2, graduated 2, noTarget 1; sClosed (DROPPED) TIDAK masuk |
| 2 | **Preview == Execute:** items.length 5, tiap item outcome + targetClassId identik dengan preview; `run.summary == preview.counts`; runBy/status/mode/finishedAt benar |
| 3 | Mutasi: sX/sXI tutup PROMOTED + buka ACTIVE baru di kelas/tahun target; sXIIa/b GRADUATED tanpa buka baru; sNoTarget tetap ACTIVE tanpa mutasi; sClosed tidak disentuh; total 8 |
| 4 | **Member.status sinkron (RFC §4.3):** sX/sXI ACTIVE, sXIIa/b INACTIVE |
| 5 | **Invarian satu-ACTIVE** per member (1 / 1 / 1 / 0 / 0) |
| 6 | **PromotionRun + Item konsisten:** runService.findById, promotionRunId sama utk tiap item, outcome valid, NO_TARGET ber-message, findMany itemCount 5 |
| 7 | **Rollback all-or-nothing:** injeksi gagal `createRunWithTx` setelah close+create → 0 run/0 item baru, enrollment & member.status tidak berubah (sX3 tetap ACTIVE, leftAt null) |
| 8 | Guard: tahun 404, tahun sama 400, mode 400, fromClassId tahun lain 400 |
| 9 | **State-based eligibility (RFC §9):** run ulang hanya memproses yang masih ACTIVE (sX3+sNoTarget), TIDAK menduplikasi siapa pun |

## 7. File yang diubah

- **Baru (3 source):** `src/main/repositories/promotion.repository.ts`, `src/main/services/promotion-execute.service.ts`, `src/main/services/promotion-run.service.ts`
- **Dimodifikasi (4 source):** `src/shared/dto/promotion.ts` (+execute/run DTO), `src/main/repositories/enrollment.repository.ts` (+`findActiveByClassesWithTx`/`closeWithTx`/`createActiveWithTx`), `src/main/repositories/class.repository.ts` (+`findByAcademicYearWithTx`), `src/main/repositories/member.repository.ts` (+`updateStatusWithTx`)
- **Baru (smoke + laporan):** `p2_execute_smoke/smoke.ts`, `WORK_ORDER_P2_IMPLEMENTATION_REPORT.md` (ini), `P2_FINAL_REVIEW.md`, `P2_RELEASE_REPORT.md`
- **Bukan target (tetap utuh):** schema, migration, IPC, preload, env.d.ts, bootstrap, UI, `Member.classId`, `Member.status` (E-3 sudah ada), EnrollmentService, AcademicYearService, ClassService, preview.

## 8. Catatan risiko (per discovery)

- R2 (keputusan basi saat execute) → terpenuhi: re-validate `decide()` dalam `$transaction` (smoke STEP 2 + STEP 9).
- R3 (no-DB-default) → mode/status/outcome/summary diisi eksplisit oleh service.
- R6 (state-based eligibility / idempotensi run ulang) → terpenuhi: hanya ACTIVE diproses; enrollment yang sudah ditutup tidak di-rewrite (smoke STEP 9).
- R7 (preview==execute) → terpenuhi: engine tunggal + smoke STEP 2.

---

**Status: IMPLEMENTED — READY Final Review.**

**Prasyarat WO berikutnya:** P-4 (retry strategy, RFC §9) dapat memakai `PromotionRunService.findById` untuk membaca run PARTIAL/FAILED + item outcome `ERROR`/`NO_TARGET`; eksekusi batch ulang tinggal memanggil `executeAutomatic` (state-based eligibility sudah menjamin hanya ACTIVE yang diproses ulang).
