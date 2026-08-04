# P5_DISCOVERY_REPORT — PROMOTION MODULE FINAL AUDIT (WO P-5)

- **Mode:** DISCOVERY ONLY / READ ONLY — **tidak ada perubahan kode, schema, migration, DTO, IPC, maupun UI.**
- **Source of Truth:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) · `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) · laporan P-1/P-2/P-3/P-4.
- **Status baseline:** commit `82c6600` (HEAD == origin/main), working tree bersih; 13 suite regression 602 PASS; lint/build/diff hijau pada verifikasi terakhir (WO P-4).

---

## 1. VERIFIKASI 6 MANDAT WAJIB

### 1.1 Mandat 1 — Preview → Execute → History memakai SINGLE DECISION ENGINE ✅
- `decide()` didefinisikan **persis satu kali**: `src/main/services/promotion-preview.service.ts:25` (fungsi MURNI — tanpa DB, tanpa state global, tanpa tulis).
- **Preview** memanggil `decide()` di `promotion-preview.service.ts:161` (`PromotionPreviewService.preview`, read-only).
- **Execute** meng-`import { decide }` dari preview service (`promotion-execute.service.ts:7`) dan memanggilnya **di dalam `$transaction`** (`:115`) dengan **re-validate state terbaru** (`findActiveByClassesWithTx` → hanya enrollment ACTIVE) — keputusan basi tidak pernah dieksekusi (RFC §7.1/§8).
- **History** (`PromotionRunService`) **tidak memanggil `decide()`** — membaca kolom `summary` (counts yang ditulis P-2). Ini **sesuai desain** (RFC §8 "preview tidak menyimpan state", §9 "retry berbasis state"); history = audit, bukan recompute.
- Grep `decide(` di seluruh source: hanya preview, execute, dan unit-test `p1_decide_smoke`. **Tidak ada engine keputusan kedua.**

### 1.2 Mandat 2 — TIDAK ada business rule di Renderer ✅
- `PromotionPage.tsx`: satu-satunya referensi simbol bisnis adalah **komentar** baris 13. Renderer hanya: meneruskan payload polos `{mode:'AUTOMATIC', fromYearId, toYearId, fromClassId?}` → menampilkan `preview.items` + kartu `preview.counts` → execute → `navigate(promotionDetailPath(run.id))`. Mapping outcome→label (OUTCOME_LABEL) adalah presentasi, bukan keputusan.
- `PromotionHistoryPage.tsx` / `PromotionRunDetailPage.tsx`: menampilkan data DTO (`counts`, `items`) yang **seluruhnya berasal dari backend** — tidak menghitung apa pun.
- Grep simbol domain (`decide|levelOrder|ACADEMIC_STATUS|EDUCATION_LEVELS|memberType|hasAcademicRecord`) di `src/pages/promotion` = **1 match (komentar)**, bukan logika.

### 1.3 Mandat 3 — TIDAK ada akses Prisma langsung dari Service (module Promosi) ✅
- `PromotionPreviewService`: hanya repositori (`academicYear/class/enrollment`) — 0 akses Prisma.
- `PromotionExecuteService`: hanya repositori (`*WithTx`) + `runTransaction(getPrisma())` sebagai **pembungkus transaksi** (bukan query langsung); seluruh baca/tulis lewat metode repo yang menerima `tx`.
- `PromotionRunService`: hanya `PromotionRepository`.
- Grep `\.prisma\.` di `src/main/services`: **0 match**.
- **Catatan di luar scope** (pre-existing, bukan Promosi): `database-reconciliation.service.ts:17-47` memegang `getPrisma()` dan melakukan query langsung `prisma.bookCopy` / `prisma.inventorySequence`. Service lain yang memakai `getPrisma()` (book-import, class, enrollment, member-import) hanya untuk `runTransaction(...)` — konsisten.

### 1.4 Mandat 4 — TIDAK ada duplicate decision logic ✅
- Satu-satunya komputasi outcome adalah `decide()`. `OUTCOME_COUNT_KEY` (execute, `:21-28`) hanyalah **pemetaan key counts**, bukan keputusan. `findTarget` adalah helper privat milik `decide()` (tidak diduplikasi).
- **Minor (bukan pelanggaran):** agregasi counts ditulis dua kali — switch di preview (`:192-213`) dan map `OUTCOME_COUNT_KEY` di execute. Ini duplikasi agregasi ringan (kandidat refactor, bukan duplikasi logika keputusan).

### 1.5 Mandat 5 — PromotionRun & PromotionRunItem = immutable audit record ✅
- **Kode:** satu-satunya tulis adalah `PromotionRepository.createRunWithTx` (`create` + `createMany`, satu transaksi). Pembacaan via `findUnique`/`findMany`. Grep `promotionRun*.update/delete` di seluruh source app: **0** (hanya definisi tipe di node_modules). Tidak ada update/delete path di repository/service/IPC/UI mana pun.
- **Schema:** kedua model tanpa `@updatedAt`; relasi FK tanpa `onDelete` (default **RESTRICT**) → menghapus `Member`/`AcademicYear` yang dirujuk run **diblokir**, jejak audit utuh. Kolom `status`/`mode`/`outcome` string bebas tanpa default (Service yang menetapkan — konsisten pola proyek).

### 1.6 Mandat 6 — Dependency antar WO P-1..P-4 terpenuhi ✅
| WO | Konsumsi | Terpenuhi |
|----|----------|-----------|
| P-1 | Config F1 (`education-level`), `AcademicYearRepository`, `ClassRepository`, `EnrollmentRepository.findActiveByClasses` (E-1) | ✅ |
| P-2 | `decide` (P-1); `EnrollmentRepository.*WithTx`; `MemberRepository.updateStatusWithTx` (E-3); `ClassRepository.findByAcademicYearWithTx`; `PromotionRepository.createRunWithTx`; `PromotionRunService` | ✅ |
| P-3 | Hasil tulis P-2 (`PromotionRun`/`Item`); `PromotionRepository.findMany/findById` (batch lookup label kelas) | ✅ |
| P-4 | `PromotionExecuteService` (P-2) + detail run (P-3) + wiring bootstrap | ✅ |
- Semua service ter-wire di `bootstrap.ts` (P-3 menambah run/repository; P-4 menambah preview/execute) → objek `Services` + `registerPromotionHandlers({runService, previewService, executeService})` lengkap.
- Regression lintasan 13 suite (termasuk p1-decide 30, p1-preview 33, p2 87, p3 75, p4 37) = **602 PASS** pada verifikasi terakhir.

---

## 2. CURRENT ARCHITECTURE (alur end-to-end)

```
UI (renderer, tanpa rule)
  PromotionPage (operator) ──payload polos──> preload promotions.preview/execute
  PromotionHistoryPage / PromotionRunDetailPage ──> promotions.findMany/findById
        │  (preload = penerus murni, env.d.ts typed)
        ▼
IPC promotion.ipc.ts (penerus murni — 4 channel, tanpa logika)
        ▼
Service layer
  PromotionPreviewService.preview  ──decide()──> PromotionPreviewDTO   (READ-ONLY)
  PromotionExecuteService.executeAutomatic  ──S$transaction──> PromotionRunDTO
        │  1) re-validate ACTIVE (WithTx) 2) decide() ulang 3) mutasi enrollment
        │     + Member.status (E-3) 4) createRunWithTx (audit)
  PromotionRunService.findById/findMany ──> DTO history (baca summary; TIDAK decide)
        ▼
Repository layer (satu-satunya akses Prisma)
  AcademicYearRepository · ClassRepository · EnrollmentRepository · MemberRepository
  PromotionRepository (createRunWithTx; findById batch-label; findMany)
        ▼
Prisma / SQLite
```

- **Satu jalur tulis** (execute) → `PromotionRun` + `PromotionRunItem`. **Preview tidak menyimpan state** (RFC §8). **History read-only** dari `summary` + items.
- Mode A (AUTOMATIC) terimplementasi penuh; MAPPING/BULK_EDIT **ditolak** `AppError 400` di preview & execute (pesan "belum didukung — ... MAPPING/BULK_EDIT = P-3/P-5").

---

## 3. FILES IMPACT ANALYSIS

| File | Peran | Temuan |
|------|-------|--------|
| `src/main/services/promotion-preview.service.ts` | `decide()` (engine tunggal) + `preview` | ✅ read-only; decide murni; preview lewat repositori |
| `src/main/services/promotion-execute.service.ts` | executor Mode A satu transaksi | ✅ decide ulang di tx; mutasi + audit; guard AppError |
| `src/main/services/promotion-run.service.ts` | history/detail read-only | ✅ baca `summary`; parse defensif; **tidak decide** |
| `src/main/repositories/promotion.repository.ts` | tulis audit + baca history | ✅ satu-satunya tulis run/item; label kelas via **batch lookup** (tanpa query per baris) |
| `src/main/repositories/enrollment.repository.ts` | `findActiveByClasses(WithTx)`, `closeWithTx`, `createActiveWithTx`, `findMemberIdsActiveInYear` | ✅ dipakai preview/execute/import |
| `src/main/repositories/member.repository.ts` | `updateStatusWithTx` (E-3) | ✅ sinkron Member.status |
| `src/shared/dto/promotion.ts` | kontrak preview/execute/history | ✅ 5 interface input/output; mode union; status union |
| `src/shared/config/academic-status.ts` | ACADEMIC_STATUS + `memberStatusForTerminalAcademic` | ✅ dipakai execute (sinkron status) |
| `electron/ipc/promotion.ipc.ts` | 4 channel `promotions:*` | ✅ penerus murni, 3 service di-inject |
| `electron/preload/promotion.preload.ts` | `promotions.*` (4) | ✅ typed via DTO shared |
| `src/renderer/env.d.ts` | deklarasi `promotions` | ✅ findMany/findById/preview/execute |
| `electron/main/bootstrap.ts` | wiring 3 service + repo | ✅ lengkap |
| `electron/ipc/index.ts` · `electron/preload/index.ts` | aggregator | ✅ `registerPromotionHandlers` + `promotionAPI` |
| `src/pages/promotion/PromotionPage.tsx` | operator UI | ✅ tanpa business rule |
| `src/pages/promotion/PromotionHistoryPage.tsx` | history UI | ✅ display-only |
| `src/pages/promotion/PromotionRunDetailPage.tsx` | detail UI (redirect target) | ✅ display-only |
| `src/routes/index.tsx` · `Sidebar.tsx` · `navigation.ts` · `labels.ts` | routing/nav/label | ✅ route `promotions/run`·`promotions`·`promotions/:id`; menu Promosi + Riwayat |

---

## 4. DEPENDENCY ANALYSIS

**Runtime (wiring):** `bootstrap` → `PromotionRepository` → `PromotionRunService`; `AcademicYearRepository+ClassRepository+EnrollmentRepository` → `PromotionPreviewService`; `AcademicYearRepository+ClassRepository+EnrollmentRepository+MemberRepository+PromotionRepository+PromotionRunService` → `PromotionExecuteService` → `registerPromotionHandlers`. Semua instansiasi selesai; bundle main memuat `promotions:preview`/`promotions:execute` (ter-verifikasi).

**Workshop (WBS):**
- P-1 ✅ (decide+preview), P-2 ✅ (executor+audit, dep P-1/CL-1/E-3 — ketiganya ada), P-3-riwayat ✅, P-4-operator ✅.
- WBS P-3 (Mapping mode) & P-4 (Retry) & P-5b (mapping UI) adalah **WO masa depan** — retry §9 sudah **inheren** pada executor P-2 (state-based eligibility: NO_TARGET/ERROR tetap ACTIVE, run ulang = delta), namun belum ada mode MAPPING/BULK_EDIT dan UI mapping.
- WBS memetakan P-5a/P-5b UI; implementasi proyek memakai penomoran P-3(history)/P-4(operator) yang disetujui PO — **tidak ada WO yang hilang** untuk Mode A.

---

## 5. RISK ANALYSIS

| # | Risiko | Level | Status/Mitigasi |
|---|--------|-------|-----------------|
| R1 | Dua execute berjalan hampir bersamaan (balapan) | LOW | SQLite men-serialkan tulis; run ke-2 hanya memproses sisa ACTIVE. **Belum ada single-flight guard** (RFC §9 poin 5) di level IPC — UI mencegah via state `executing`, tapi IPC bisa dipanggil 2× → run kosong noise. Opsional: guard `isRunning`. |
| R2 | Preview ≠ Execute bila data berubah antar keduanya | LOW (by-design) | Re-validate di dalam `$transaction` → hanya ACTIVE diproses; tidak pernah eksekusi keputusan basi (RFC §7.1/§8). |
| R3 | `summary` berisi JSON string di kolom bebas | LOW | `parseSummary`/`parseRunCounts` defensif (try/catch, default 0). |
| R4 | Duplikat member dalam satu run (masa depan MAPPING) | LOW | Saat ini Mode A all-or-nothing per member; bila MAPPING ditambahkan, pertimbangkan `@@unique([promotionRunId, memberId])` di schema (di luar scope sekarang). |
| R5 | `runBy` kosong (belum ada auth) | INFO | Audit tetap lengkap via `startedAt`/`mode`; tinggal diisi bila login ada. |

---

## 6. ARCHITECTURE COMPLIANCE (RFC)

| RFC | Ketentuan | Status |
|-----|-----------|--------|
| §2.2 | PromotionRun/Item sebagai audit; outcome 6 nilai | ✅ |
| §4 | Tiga status terpisah (MemberType/Status/AcademicStatus) | ✅ `academic-status.ts` + E-3 |
| §6.2 | Tutup = update (tidak pernah DELETE) | ✅ `closeWithTx` |
| §7 Mode A | level+1, parallel+kurikulum cocok, XII→GRADUATED, tanpa target→NO_TARGET | ✅ `decide()` |
| §7.1 | Preview → run → satu $transaction → status run → summary | ✅ (status selalu SUCCESS; PARTIAL/FAILED untuk mode lain) |
| §8 | Preview read-only, fungsi sama dengan execute, re-validate di tx | ✅ |
| §9 | Retry berbasis state; NO_TARGET/ERROR tetap ACTIVE; re-validation; forward-only | ✅ inheren P-2 |
| §9 #5 | Single-flight | ⚠️ belum ada guard IPC (R1) |

---

## 7. REMAINING TECHNICAL DEBT

1. **Single-flight guard eksekusi** (RFC §9 #5) — belum ada; UI cukup, IPC tidak.
2. **Duplikasi agregasi counts** — switch preview vs `OUTCOME_COUNT_KEY` execute (kandidat helper bersama).
3. **`DatabaseReconciliationService` akses Prisma langsung** — di luar module Promosi, pre-existing; bila mandat #3 diberlakukan global, refactor ke repository.
4. **Mode MAPPING/BULK_EDIT belum ada** (WBS P-3/P-5b) — saat ini ditolak 400; setelah Mode A final, lanjut ke mode lain bila PO setuju.
5. **`PromotionRun.status`** bebas string; hanya SUCCESS yang ditulis.
6. **No `@@unique([promotionRunId, memberId])`** pada PromotionRunItem (relevan saat MAPPING).
7. **History tanpa pagination UI** (`findMany` default page 1/20) — acceptable untuk volume run saat ini.
8. **`runBy` kosong** (belum ada auth).

---

## 8. IMPLEMENTATION PLAN (jika masih ada)

**Kesimpulan: untuk WO P-5 (PROMOTION FINALIZATION) TIDAK ada implementasi yang diperlukan** — module Mode A lengkap, 6 mandat terverifikasi, seluruh gate hijau. Opsi lanjutan yang DIPUTUSKAN PO di masa depan (bukan bagian P-5 ini):
- (Opsional, LOW) Tambah single-flight guard execute (RFC §9 #5).
- (Opsional, LOW) Unifikasi agregasi counts (preview/execute).
- (Baru) WO mode MAPPING + BULK_EDIT + UI mapping (WBS P-3/P-5b) — setelah review PO.
- (Baru) Refactor `DatabaseReconciliationService` ke repository bila mandat global #3 diberlakukan.

---

## 9. VALIDATION PLAN

- **Regression saat ini (terakhir dijalankan pada WO P-4):** 13 suite fresh DB = **602 PASS / 0 FAIL**; `npm run lint` PASS; `npm run build` PASS (main 1,817.22 · preload 9.02 · renderer 1,045.33 kB); `prisma migrate diff` = "No difference detected".
- **Rekomendasi UAT manual (Product Owner):** jalankan Mode A di aplikasi — Preview → verifikasi counts/items → Execute → redirect ke Detail → cek Riwayat; verifikasi bahwa mengubah kelas target lalu re-execute hanya memproses sisa ACTIVE (delta, bukan full re-run).
- Bila setelah review PO diputuskan ada perbaikan (single-flight/agregasi), run ulang seluruh gate di atas sebelum commit.

---

## 10. EXIT CRITERIA (P-5)

1. ✅ Seluruh 6 mandat WAJIB terverifikasi (1.1–1.6).
2. ✅ Tidak ada perubahan kode/schema/migration/DTO/IPC/UI (DISCOVERY ONLY — working tree bersih).
3. ✅ Dependency P-1..P-4 terpenuhi.
4. ✅ Module Mode A siap produksi (build/lint/diff hijau; 602 PASS).
5. ⬜ **Menunggu review Product Owner** — keputusan: release-finalization selesai ATAU lanjut WO mode MAPPING/BULK_EDIT / debt opsional.

---

**Status: DISCOVERY COMPLETE — BERHENTI menunggu review Product Owner. Tidak ada implementasi dilakukan.**
