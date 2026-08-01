# GIT_RECOVERY_STEP3_REPORT.md — Temporary Artifact Verification (D3)

**Tanggal:** 01 Agustus 2026
**Mode:** READ ONLY — TIDAK ada edit `.gitignore`, `git add/commit/restore/clean/rm`.
**Status:** **COMPLETE — ANALYZED**

---

## Ringkasan Temuan Utama

Semua 142 entri untracked dianalisa satu-per-satu terhadap **referensi import/import dari source code** (bukan hanya nama folder).

**TEMUAN PENTING (folder bernama mencurigakan tapi DIPAKAI produksi):**

| Folder | Terlihat | Kenyataan |
|--------|----------|-----------|
| `src/services/` (DummyMatchStrategies, DummyMatchProviders) | Nama "Dummy" → testing | **PRODUKSI** — `MatchingEngineService.ts:11,14` memakai `dummyMatchStrategies` sebagai **default constructor**. `DummyMatchProviders` dikonsumsi barrel `MatchProviders.ts`. Keduanya bagian dari komposisi root produksi |
| `src/services/strategies/` | Seperti helper | **PRODUKSI** — di-import `src/main/strategies/index.ts` (bootstrap produksi) |
| `src/main/providers/index.ts` (`createPrismaMatchProviders`) | Provider produksi | **DEAD CODE @deprecated** — **0 konsumen** di seluruh repo. 4 file provider individu (`prisma-*-match.provider.ts`) tetap **dipakai** `src/main/strategies/index.ts:6-9` |
| `src/main/services/inventory-allocator.ts` | Service baru | **PRODUKSI (file KEDUA)** — file baru WO-11E dipakai `src/main/services/book-import.service.ts:6`. **Berbeda** dengan `electron/main/services/inventory-allocator.ts` (tracked, dipakai bootstrap + book-copy.service) |
| `templates/Template_Import_Buku_v2.0.xlsx` | Terlihat aset template | **PRODUKSI** — direferensikan `electron/ipc/book-import.ipc.ts:9` (TEMPLATE_FILE_NAME) + dikemas `electron-builder.yml:22` |

---

## 1. KEEP (tetap di working tree — belum diputuskan commit/ignore)

| Item | Alasan |
|------|--------|
| `templates/Template_Import_Buku_v2.0_screenshot.png` | Artifact review PO; bukan aset runtime. Simpan untuk referensi visual, atau pindah ke `docs/` bila mau di-versi |
| `src/main/providers/index.ts` | `@deprecated`, 0 konsumen. Jangan dihapus dari working tree (masih bagian barrel), tapi tidak wajib di-commit; disarankan **COMMIT** sebagai catatan deprecated bersama folder providers |

**Catatan:** KEEP = file tidak di-ignore, tidak hilang; hanya menunggu keputusan PO.

---

## 2. IGNORE (artefak sementara — tambahkan ke `.gitignore`)

### A. Temporary UAT / Probe / Smoke (sekali pakai, butuh fresh DB)
| Item | Isi | Bukti temp |
|------|-----|-----------|
| `uat_wo3/` | e2e.smoke.ts, import.smoke.ts, reader.check.cjs, validation.smoke.ts | UAT ad-hoc; import produksi tapi tak di-import produksi |
| `uat_wo11h/` | instr.probe.ts, pipeline.probe.ts, step.probe.ts | Probe instrumentasi |
| `uat_wo11i/` | duplicate.validate.ts, reconcile.validate.ts | Validasi rekonsiliasi ad-hoc |
| `uat_wo11j/` | summary.validate.ts | Validasi summary ad-hoc |
| `wo11a/` | smoke.ts | Per-WO smoke |
| `wo11c/` | smoke.ts (referensi template v1) | Per-WO smoke |
| `wo11d/` | smoke.ts | Per-WO smoke |
| `wo11e/` | smoke.ts | Per-WO smoke |
| `wo11f/` | smoke.ts | Per-WO smoke |
| `wo11g/` | runtime.cjs | Runtime experiment |

### B. Temporary Runtime / Legacy Smoke / Screenshot
| Item | Alasan |
|------|--------|
| `scripts/smoke-match-strategies.ts` | Smoke legacy WO-7; 0 konsumen produksi; hanya disebut di docs. Tidak boleh masuk commit tanpa keputusan (D3 → ignore/hapus) |
| `templates/Template_Import_Buku_v1.0.xlsx` | Template v1; **hanya** direferensikan `wo11c/smoke.ts` (temp) — BUKAN produksi |
| `templates/Template_Import_Buku_v1.0_screenshot.png` | Screenshot v1 review |

---

## 3. COMMIT (masuk riwayat — dipakai produksi / dokumentasi resmi)

### A. Production Source (terverifikasi di-import chain produksi)
| Item | Referensi produksi |
|------|--------------------|
| `electron/ipc/book-import.ipc.ts` | `electron/ipc/index.ts:24` |
| `electron/preload/book-import.preload.ts` | `electron/preload/index.ts:17` |
| `prisma/migrations/20260731_wo13_procurement_fields/` | Diperlukan fresh `migrate deploy` |
| `prisma/migrations/20260731_wo13_revision1_source_detail/` | Diperlukan fresh `migrate deploy` |
| `src/components/books/FileUploadDropzone.tsx` | `BookImportPage.tsx:4` |
| `src/config/bookImport.template.ts` | `ValidationEngineService.ts:15` |
| `src/config/import.config.ts` | `FileUploadDropzone.tsx:5` |
| `src/contexts/BookImportContext.tsx` | `routes/index.tsx:3,39` |
| `src/hooks/useBookImportWorkflow.ts` | `BookImportPage.tsx:9` |
| `src/main/providers/prisma-{author,book,category,publisher}-match.provider.ts` | `src/main/strategies/index.ts:6-9` |
| `src/main/services/auto-create.service.ts` | `book-import.ipc.ts:5` |
| `src/main/services/barcode.service.ts` | `label.service.ts:2` |
| `src/main/services/book-import.service.ts` | `book-import.ipc.ts:6`, `ipc/index.ts:22` |
| `src/main/services/database-reconciliation.service.ts` | `electron/main/index.ts:6,38` |
| `src/main/services/inventory-allocator.ts` | `book-import.service.ts:6` |
| `src/main/services/label.service.ts` | `electron/main/services/print.service.ts:5` |
| `src/main/strategies/index.ts` | `bootstrap.ts:35` |
| `src/pages/BookImportPage.tsx` | `routes/index.tsx:8,44` |
| `src/pages/BookImportPreviewPage.tsx` | `routes/index.tsx:9,45` |
| `src/services/DummyMatchStrategies.ts` | `MatchingEngineService.ts:11,14` (default) |
| `src/services/DummyMatchProviders.ts` | `MatchProviders.ts` barrel |
| `src/services/HeaderNormalizerService.ts` | `ValidationEngineService.ts` |
| `src/services/MatchProviders.ts` | `DummyMatchProviders.ts:7` (barrel) |
| `src/services/MatchingEngineService.ts` | `bootstrap.ts:34`, `ipc/index.ts:20` |
| `src/services/ValidationEngineService.ts` | `useBookImportWorkflow.ts:5` |
| `src/services/WorkbookReaderService.ts` | `useBookImportWorkflow.ts:4` |
| `src/services/strategies/*` (10 file) | `src/main/strategies/index.ts:10-13` |
| `src/shared/match-provider.ts` | `types/import.ts:1-2` |
| `src/shared/match-strategy.ts` | `MatchingEngineService.ts:10` |
| `src/types/import.ts` | Seluruh pipeline (bootstrap, ipc, preload, hooks, env.d.ts:198-199) |
| `src/utils/bookImport.ts` | `BookImportPage.tsx` (import handler + summary) |
| `templates/Template_Import_Buku_v2.0.xlsx` | `book-import.ipc.ts:9`, `electron-builder.yml:22` |

### B. Documentation (resmi)
- `SPRINT4_REPORT.md` … `SPRINT11_WO11J_IMPLEMENTATION_REPORT.md`
- `SPRINT2_1_REPORT.md`, `SPRINT3_TEMPLATE_SPEC.md`, `SPRINT3_WO1_TEMPLATE_IMPLEMENTATION_REPORT.md`
- `SPRINT8_*.md`, `SPRINT9_*.md`, `SPRINT10_*.md` (WO1/WO2/WO3)
- `WO13_*.md`, `ENVIRONMENT_AUDIT.md`, `PRODUCTION_READINESS_AUDIT_SPRINT8.md`, `REACT_RENDER_TREE_AUDIT.md`, `RELEASE_ARTIFACT_AUDIT.md`
- `GIT_RELEASE_AUDIT.md`, `GIT_RECOVERY_PLAN.md`, `GIT_RECOVERY_STEP0/1/2_REPORT.md`

---

## 4. Risiko jika di-ignore

| # | Risiko | Dampak | Mitigasi |
|---|--------|--------|----------|
| R1 | **`templates/Template_Import_Buku_v2.0.xlsx` TIDAK boleh di-ignore** | Release baru kehilangan template download | Jangan ignore v2.0; hanya ignore v1.0 |
| R2 | **Ignore `scripts/smoke-match-strategies.ts`** | Smoke WO-7 hilang dari repo; regenerasi butuh waktu | Terima; dokumentasi kontrak ada di laporan. Atau simpan di `scripts/smoke/` bila ingin di-commit |
| R3 | **Ignore `src/main/providers/index.ts`** | Barrel deprecated tidak ter-version | Tidak berdampak runtime (0 konsumen); tetap disarankan commit bersama folder |
| R4 | **Ignore folder UAT/probe** | Bukti pengujian ad-hoc tidak terdokumentasi | Hasil & konklusi sudah di-commit di REPORT/`.md`; file skrip tidak perlu |
| R5 | **Ignore `uat_wo3/*`** | UAT WO-3 (95/95 PASS) tidak bisa dijalankan ulang tanpa menulis ulang | Ringkasannya ada di `SPRINT10_WO3_UAT_REPORT.md`; regenerable |
| R6 | **File `src/` di-ignore salah pola** (mis. pola `src/services/`) | **APLIKASI RUSAK** — build gagal | **JANGAN** pakai pola luas; ignore hanya folder UAT/temp eksplisit (`uat_*`, `wo11*`) |

---

## 5. Rekomendasi Perubahan `.gitignore` (belum diimplementasikan)

```gitignore
# --- Step 3 additions (D3) ---

# Temporary UAT / probe / smoke (sekali pakai, butuh fresh DB)
uat_wo*/
wo11*/

# Legacy smoke (WO-7) — kontrak terdokumentasi di laporan
scripts/smoke-match-strategies.ts

# Template v1 (legacy, hanya dipakai wo11c/smoke.ts yang juga temp)
templates/Template_Import_Buku_v1.0.xlsx
templates/Template_Import_Buku_v1.0_screenshot.png

# Screenshot review (opsional: pindah ke docs/ jika ingin di-commit)
templates/Template_Import_Buku_v2.0_screenshot.png

# Prisma SQLite WAL/SHM (selain *.db & *.db-journal yang sudah ada)
prisma/*.db-wal
prisma/*.db-shm
```

**PENTING — yang TIDAK BOLEH di-ignore (dipake produksi):**
- `templates/Template_Import_Buku_v2.0.xlsx`
- `src/services/**`, `src/main/services/**`, `src/main/providers/**`, `src/main/strategies/**`
- `src/config/**`, `src/contexts/**`, `src/hooks/**`, `src/shared/match-*`, `src/types/import.ts`, `src/utils/bookImport.ts`
- `electron/ipc/book-import.ipc.ts`, `electron/preload/book-import.preload.ts`
- `prisma/migrations/20260731_wo13_*`

---

## Kesimpulan
- **IGNORE (temp):** 4 folder `uat_wo*/` + 6 folder `wo11*/` + `scripts/smoke-match-strategies.ts` + template v1 + 2 screenshot + prisma WAL/SHM.
- **COMMIT (produksi):** seluruh pipeline import (engine/strategi/provider/service/UI/IPC/preload), migration WO13, template v2.0.
- **COMMIT (docs):** seluruh laporan Sprint 4–11, RFC, audit, WO13, dan laporan Git Recovery.
- **KEEP:** `Template_Import_Buku_v2.0_screenshot.png` (keputusan PO) — disarankan dipindah ke `docs/`.
- **Peringatan khusus:** `src/services/DummyMatchStrategies.ts` & `DummyMatchProviders.ts` **bukan** testing — mereka komposisi root produksi (default MatchingEngine). **Jangan di-ignore.**
- **Peringatan duplikasi:** ada **dua** `inventory-allocator.ts` berbeda (`electron/main/services/` tracked vs `src/main/services/` untracked) — keduanya produksi, bukan duplikat yang sama.

**Status: COMPLETE — menunggu approval Product Owner untuk implementasi `.gitignore` (Step berikutnya).**
