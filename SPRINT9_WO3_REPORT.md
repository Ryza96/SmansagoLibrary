# SPRINT9_WO3_REPORT.md

Feature: **Book Import — Validation Stage (WO-3)**
Mode: IMPLEMENTATION (audit + fix minimal)
Date: 2026-07-31

---

## 1. Implementation Report

### Hasil audit (5 poin scope WO-3)

| Poin | Temuan | Status |
|------|--------|--------|
| 1. Struktur workbook | IMP-005 (no worksheet), IMP-006 (empty workbook), IMP-007 (empty worksheet), IMP-008 (min columns), IMP-009 (header only). **Gap nyata: baris pertama kosong + ada data → lolos validasi** (silent data loss) | ⚠️ FIXED |
| 2. Header | IMP-010 (count), IMP-011 (name), IMP-012 (order) via `HeaderNormalizerService`; validasi header harus bersih sebelum baris diproses | ✅ sesuai |
| 3. Validasi baris | IMP-013 (required value), IMP-014 (type mismatch) — per kolom posisional; dijalankan hanya bila header bersih | ✅ sesuai |
| 4. canonicalRows | Dibentuk hanya dari baris valid (`valid === true`), mapping posisional `key: value`, dibungkus guard header-bersih | ✅ sesuai |
| 5. validationResult | `valid = errors.length === 0 && allRowsValid`; error struktur+header di `errors`, error baris di `rowResults` (dipisah; UI preview menampilkan keduanya) | ✅ sesuai |

### Bug yang diperbaiki (perbaikan benar-benar diperlukan)

**Bug:** Workbook dengan **baris pertama kosong** (header blank) + baris data setelahnya lolos validasi sebagai `valid=true` dengan **0 canonicalRows dan 0 rowResults** → data diset untuk di-import tanpa disadari (silent data loss). Konfirmasi smoke test sebelum fix: `valid=true`, errors=[], canonical=0.

**Root cause:** `hasHeader = target.rows[0].length > 0` → `false` untuk baris pertama kosong. Blok validasi header & baris keduanya diguard `hasHeader`, sehingga untuk kasus ini **semua validasi dilewati** tanpa mencatat error apa pun. `IMP-009` hanya menangkap kasus `rows.length === 1` (header saja), bukan `rows[0]` kosong dengan data di bawahnya.

**Fix (minimal, 1 file):** `src/services/ValidationEngineService.ts` — saat `!hasHeader && target.rows.length > 0`, catat `IMP-010` (header count, expected = jumlah kolom wajib, actual = 0). Berarti workbook blank-header kini ditolak: `valid=false`, error tampil di preview, canonicalRows tetap kosong (row interpretation tidak dipercaya).

```
sebelum:  rows[0] = [] , rows[1] = [data...]  → valid=true, canonical=0   (data hilang senyap)
sesudah:  rows[0] = [] , rows[1] = [data...]  → valid=false, IMP-010      (ditolak dengan pesan)
```

### Batasan WO-3 (tidak disentuh)
- Parsing Trigger WO-2.1 (`useBookImportWorkflow.ts`, `BookImportPage`, `BookImportPreviewPage`) — tidak diubah.
- `WorkbookReaderService`, `MatchingEngineService`, `MatchProviders`, match strategies — tidak diubah.
- `HeaderNormalizerService` — tidak diubah (tidak ditemukan bug nyata).

### Validasi
| Tes | Hasil |
|-----|-------|
| Smoke test `ValidationEngineService.validate` (9 kasus) | ALL PASS — valid, blank-header (IMP-010), order (IMP-012), required (IMP-013), type (IMP-014), empty (IMP-006), header-only (IMP-009) |
| `npm run lint` (node + web tsconfig) | PASS — exit 0 |
| `npm run build` (electron-vite build) | PASS — ✓ built, exit 0 |

---

## 2. Architecture Checklist

| Kriteria | Status | Bukti |
|----------|--------|--------|
| Validation adalah stage mandiri (pure service, entry tunggal `validate(RawWorkbook) → ValidatedWorkbook`) | ✅ | `ValidationEngineService.ts:106` — konsumsi `RawWorkbook`, kembalikan `ValidatedWorkbook` (embeds `rawWorkbook`), tanpa side-effect |
| Validation terpisah dari parsing secara struktural | ✅ | Service terpisah dari `WorkbookReaderService`; dipanggil sebagai langkah diskret dalam pipeline |
| Struktur workbook divalidasi | ✅ | IMP-005..009 + fix blank-header |
| Header divalidasi (count/name/order) | ✅ | IMP-010/011/012 |
| Baris divalidasi hanya bila struktur+header aman | ✅ | guard `hasHeader && headerErrors.length === 0` |
| canonicalRows dibentuk hanya dari baris valid | ✅ | `if (valid) canonicalRows.push(...)` |
| validationResult memadukan semua error | ✅ | `valid` memperhitungkan `errors` + `allRowsValid` |
| Error baris terpisah dari error struktur (kontrak konsumen jelas) | ✅ | `rowResults` vs `errors`; preview merender keduanya |
| Parsing Trigger WO-2.1 tidak diubah | ✅ | 0 diff pada hook/pages import |
| lint + build hijau | ✅ | bagian 1 |

---

## 3. Decision Log

| ID | Keputusan | Alasan | Konsekuensi |
|----|-----------|--------|-------------|
| DEC-01 | **Fix blank-header dengan IMP-010** (bukan kode baru) | `IMP-010` = "Jumlah header tidak sesuai template" — kosong vs wajib 5 adalah mismatch count; menghindari penambahan kode error + label + tipe baru (minimal perubahan) | Workbook blank-header ditolak: `valid=false`, error IMP-010 (expected=5, actual=0) |
| DEC-02 | Fix dilakukan di `ValidationEngineService` | File TIDAK masuk daftar larangan WO-3 (hanya Parsing Trigger, Matching Engine, WorkbookReaderService, HeaderNormalizerService yang dilarang); bug adalah penyimpangan struktur/header → scope WO-3 | 1 file berubah |
| DEC-03 | Hoist `templateColumns` + `requiredColumnCount` ke atas `hasHeader` | Dibutuhkan oleh cabang `!hasHeader`; refactor struktural minimal tanpa mengubah logika cabang `hasHeader` | Blok `if (hasHeader)` kini `else if (hasHeader)` |
| DEC-04 | Tidak mengubah aturan type-mismatch (string vs number) | `Tahun` bertipe `number`; angka sebagai teks (mis. format sel "text") dianggap IMP-014 — ini kebijakan validasi yang disengaja, bukan bug; mengubahnya = scope creep | Dicatat sebagai catatan perilaku (bukan utang) |
| DEC-05 | Tidak menyatukan `rowResults` ke `errors` | `errors` = struktur+header, `rowResults` = per-baris; `valid` sudah memperhitungkan keduanya; UI preview menampilkan keduanya. Semantik konsisten | Tidak ada perubahan |
| DEC-06 | Tidak menambah stage `parseFile`/`validateWorkbook` terpisah di hook | Membongkar `parseAndValidate` = mengubah Parsing Trigger WO-2.1 yang dilarang; validasi sudah merupakan stage mandiri di service layer | Tidak ada perubahan trigger |

---

## 4. Technical Debt

| ID | Utang | Detail | Dampak | Rencana |
|----|-------|--------|--------|---------|
| TD-01 | `validationResult.warnings` selalu kosong | `warnings` di `validate()` tidak pernah diisi (IMP-010/011/012/013/014 semua error, bukan warning) | Fitur warning belum terpakai; preview punya cabang warnings tapi tak pernah tampil | Kategorisasi warning (mis. type coercion) bila dibutuhkan — di luar scope WO-3 |
| TD-02 | Type-mismatch ketat | Angka sebagai teks pada kolom `number` (mis. Tahun format sel text) → IMP-014; tidak ada koreksi otomatis | User harus memperbaiki file Excel; bisa mengganggu data hasil export yang memformat angka sebagai teks | Kebijakan coercion/normalisasi tipe dipertimbangkan WO parsing/import berikutnya |
| TD-03 | Mapping posisional `canonicalRows` | `values[key] = row[index] ?? null` — aman karena guard header-bersih (urutan wajib persis template), tapi bergantung pada aturan itu | Bila template berubah (kolom opsional, urutan bebas) mapping perlu menyesuaikan | Ikut evaluasi saat template/header rules berubah |
| TD-04 | `minColumns: 1` terpisah dari template | Config import terpisah dari struktur template (5 kolom wajib) | Nilai `minColumns` jarang berperan (selalu kalah spesifik oleh IMP-010) | Konsolidasi config+template bila WO lain menyentuh keduanya |

---

**Status: READY untuk review.** Perubahan hanya 1 file (`ValidationEngineService.ts`) — fix blank-header; Parsing Trigger & service lain tidak disentuh. Menunggu review Product Owner.
