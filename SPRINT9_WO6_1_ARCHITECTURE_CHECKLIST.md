# SPRINT9 — WO-6.1 Architecture Checklist
**Template Import + Publisher**

## 1. Ruang Lingkup (harus terpenuhi)
| # | Kriteria | Status | Bukti |
|---|----------|--------|-------|
| 1 | Template Excel punya kolom Publisher | ✅ | `src/config/bookImport.template.ts` — kolom `{ key: 'publisher', label: 'Penerbit', requiredColumn: true, requiredValue: true, dataType: 'string', nullable: false }` (posisi 3, id `book-import-v3`) |
| 2 | Header Normalizer mengenali kolom Publisher | ✅ | `src/services/HeaderNormalizerService.ts` — `HEADER_SYNONYMS = { publisher: 'penerbit' }`; header `Penerbit`, `Publisher`, `PENERBIT` → `penerbit` (smoke: ketiganya valid) |
| 3 | Validation tetap PASS (file valid dengan kolom baru) | ✅ | Smoke: template 6 kolom → `valid` true, `canonicalRows = 2` |
| 4 | CanonicalRow menghasilkan field `publisher` | ✅ | Smoke: `values.publisher = "Republika"` / `"Bentang Pustaka"` |
| 5 | Matching publisher bekerja | ✅ | Smoke: `Bentang Pustaka` → FOUND (id `publisher1`); `Republika` → NOT_FOUND lalu di-resolve via Auto Create |
| 6 | Auto Create publisher bekerja | ✅ | Smoke: `Publisher Republika` dibuat di DB; `resolvedEntity.id` = id DB |
| 7 | Book Import menghasilkan `publisherId` | ✅ | Smoke: Book `Negeri 5 Menara.publisherId` = id Republika; Book `Laskar Pelangi.publisherId` = `publisher1` |

## 2. JANGAN (tidak boleh diubah — diverifikasi)
| Komponen | Status |
|----------|--------|
| Matching Engine (`src/services/MatchingEngineService.ts`) | ✅ tidak diubah |
| AutoCreateService (`src/main/services/auto-create.service.ts`) | ✅ tidak diubah |
| BookImportService (`src/main/services/book-import.service.ts`) | ✅ tidak diubah |
| Repository (author/publisher/category/book) | ✅ tidak diubah |
| Algoritma Matching (strategy/provider) | ✅ tidak diubah |

## 3. Batasan non-fungsional
| Aspek | Status |
|-------|--------|
| Perubahan file | Minimal — 2 file sumber (`bookImport.template.ts`, `HeaderNormalizerService.ts`) |
| Tidak ada perubahan database | ✅ (tidak ada schema/migrasi baru) |
| Tidak ada perubahan IPC / preload / `env.d.ts` / tsconfig | ✅ |
| Tidak ada perubahan UI (tidak ada scope creep) | ✅ |
| Gate build & lint | ✅ `npm run lint` PASS, `npm run build` PASS (main 112.48 kB) |
| Smoke end-to-end fresh DB | ✅ 24/24 PASS, DB uji dibersihkan |
| Konsumen lain dari template | ✅ grep `BOOK_IMPORT_TEMPLATE`: hanya `ValidationEngineService` + config |

## 4. Kesimpulan
Seluruh kriteria RUANG LINGKUP terpenuhi, seluruh komponen pada daftar JANGAN tidak tersentuh,
perubahan minimal (2 file), dan semua gate (lint/build/smoke) hijau. **READY untuk review PO.**
