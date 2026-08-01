# SPRINT8_REVISION2_REPORT.md

Sprint: **8 — Matching Strategy Refactor (ADR-018/019)**
Mode: IMPLEMENTATION — REVISION 2 (RFC Revision 2 disetujui; Revision 1 ditolak, Revision 3 tidak diadopsi)
Date: 2026-07-31
Basis: `SPRINT8_REVISION2_RFC.md`, `SPRINT8_IMPLEMENTATION_PLAN.md`, `SPRINT8_EXECUTION_PROTOCOL.md`

---

## 1. Ringkasan

Sprint 8 memindahkan keputusan pencocokan dari "provider tunggal yang menyembunyikan cara mencocokkan" menjadi **Strategy per field×perilaku** (ADR-018) yang memanggil **operasi eksplisit repository** (ADR-019). Semua 8 Work Order selesai dan disetujui.

| WO | Deliverable | Status |
|----|-------------|--------|
| WO-1 | `src/shared/match-strategy.ts` — SPI `MatchStrategy` (4 sub-interface: author/publisher/category/book) | DONE ✓ |
| WO-2 | Operasi eksplisit repository: `findExact`/`findContains`/`findPrefix`/`findAll` (Author/Category/Publisher) + `findAll` (Book) | DONE ✓ |
| WO-3 | `match-provider.ts` restructured — `NamedMatchProvider`/`BookMatchProvider`, 8 provider (4 Dummy + 4 Prisma) memakai operasi eksplisit; `findMatches` jadi method transisi deprecated | DONE ✓ |
| WO-4 | `src/services/strategies/` — 8 strategy class + `similarity.ts` + `dedupe.ts` + `DummyMatchStrategies.ts` | DONE ✓ |
| WO-5 | `MatchingEngineService` beralih dari `MatchProvider` ke `MatchStrategy` (default = `dummyMatchStrategies`) | DONE ✓ |
| WO-6 | `src/main/strategies/index.ts` — Composition Root produksi `createProductionStrategies()`; `createPrismaMatchProviders` di-deprecate | DONE ✓ |
| WO-7 | `scripts/smoke-match-strategies.ts` — 19 assertions (Production root, Dummy root, Engine end-to-end) | DONE ✓ |
| WO-8 | Regression + Sprint Closing (WO ini) | DONE ✓ |

## 2. Arsitektur Final

```
MatchingEngineService (WO-5) ──▶ MatchStrategy[] (WO-1)
                                   │
                    ┌──────────────┴───────────────┐
                    │                              │
        DummyMatchStrategies (WO-4)      createProductionStrategies (WO-6)
        ─── Dummy  MatchProviders ──▶   ─── Prisma*MatchProviders (WO-3) ──▶ Repositories (WO-2) ──▶ Prisma
```

- **Composition Root = satu-satunya tempat merangkai** Strategy → Provider → Repository (produksi: `src/main/strategies/index.ts`; testing: `DummyMatchStrategies.ts`).
- **Engine tidak membuat Strategy; Strategy tidak membuat Provider; Provider tidak membuat Repository.**
- Default produksi (D2): `isbn→ExactBook`, `authors→ContainsAuthor`, `publisher→ContainsPublisher`, `category→ContainsCategory`.

## 3. Perubahan Perilaku yang Disengaja (Intent Change)

| Aspek | Sebelum Sprint 8 | Sesudah | Catatan |
|-------|------------------|---------|---------|
| Dummy author/publisher/category | **exact** | **contains** (paritas produksi) | Satu-satunya perubahan perilaku disengaja (plan §WO-4, baris 280). Input smoke lama (`andrea hirata`, `gramedia`, `bentang pustaka`, ISBN) tetap `FOUND` karena substring. |
| Status mapping | 0→NOT_FOUND / 1→FOUND / >1→AMBIGUOUS | **tidak berubah** | Kontrak `MatchedWorkbook`/`FieldMatch`/`MatchStatus` identik bentuknya. |
| Engine output `FieldMatch.provider` | `provider.id` | `strategy.providerId` | Nilai = id provider asal data (sama maknanya; strategy menyimpan `providerId` dari provider yang disuntikkan). |

## 4. Regression — WO-8

| Tes | Hasil |
|-----|-------|
| Fresh DB `prisma migrate deploy` (3 migrations) | PASS — urutan: `20260731_adr002_initial` → `20260731_wo13_procurement_fields` → `20260731_wo13_revision1_source_detail` |
| Smoke WO-7 dijalankan ulang (fresh DB) | PASS — 19/19 |
| `npm run lint` (node + web) | PASS — exit 0 |
| `npm run build` (electron-vite) | PASS — bundle identik baseline: main 88.19 kB, preload 6.35 kB, renderer 880.99 kB |
| Targeted eslint (seluruh file scope Sprint 8) | PASS — 0 masalah |
| Full-repo eslint | 17 error + 41 warning — **semuanya di file di luar scope** (UI pages `src/pages/*`, `src/components/*`, `electron/main/*` legacy, `src/shared/dto/master.ts`) yang sudah ada sejak sebelum Sprint 8. Tidak ada file Sprint 8 yang terdampak. |

Catatan regression:
- Suite Sprint 6 (18 test), Sprint 7 (25 test), Sprint 8 (16 test DB+unit) pada plan §9 adalah **script one-off yang sudah dibersihkan** pada sprint masing-masing; tidak ada artifact test yang di-retain selain `scripts/smoke-match-strategies.ts`. Regression terhadapnya dinyatakan melalui (a) smoke WO-7 yang mengikat kontrak baru, dan (b) pemeriksaan test-by-test ekspektasi intent-change (tabel §3).
- `createPrismaMatchProviders` terkonfirmasi **tidak dipakai** (grep: hanya definisinya) — tetap dipertahankan deprecated-final sesuai instruksi PO (jangan hapus compatibility layer yang dijadwalkan di luar WO-8).
- `dummyMatchProviders` juga tidak dipakai — dipertahankan sebagai bagian compatibility layer.

## 5. Teknis & Keputusan Kunci (Decision Log Ringkas)

| # | Keputusan | Alasan |
|---|-----------|--------|
| D3 | `findMatches(value)` dipertahankan sebagai **method transisi deprecated** (mendelegasi ke operasi eksplisit) | Memastikan Engine tetap kompilasi selama WO-3–WO-4; sesuai keputusan PO, **belum dihapus** di WO-8 (dijadwalkan keluar sprint ini). |
| D5 | Engine konstruktor `(strategies: readonly MatchStrategy[] = dummyMatchStrategies)` | Strategi default tersuntik; `providerId` menggantikan `provider.id`. |
| D6 | `createProductionStrategies()` di `src/main/strategies/index.ts`; `tsconfig.node.json` menambah `src/services/strategies/**/*` | Composition Root produksi; fix minimal TS6307 (project boundary) tanpa mengubah struktur. |
| D7 | Negative test memakai `xyzzy` (bukan `pramoedya` — ada di dataset Dummy) | Mencegah false positive. |

## 6. Technical Debt (Utang Terjadwal)

1. **Compatibility layer (dead code dari sisi Engine):** method transisi `findMatches` di `MatchProvider` + 8 delegate provider (WO-3) + `dummyMatchProviders` + `createPrismaMatchProviders` (deprecated). Dihapus pada **WO cleanup / Sprint 9** sesuai instruksi PO.
2. **`src/services/strategies/` masuk dua project tsconfig** (web via `src/services/**/*`, node via include WO-6) — overlap berpola sama seperti `src/shared/**/*`; tidak berdampak runtime.
3. **Case-insensitivity produksi** (`findContains` = semantik SQLite LIKE) — perilaku dikenal; normalisasi query bila diperlukan ditangani di Sprint 9 (di luar scope).
4. **Full-repo eslint tidak bersih** — 17 error/41 warning di file legacy & UI di luar scope (WO-BR-99/WO13/UI sprint sebelumnya). Bukan regresi Sprint 8.
5. **Belum ada commit** — seluruh Sprint 8 ada di working tree (di atas perubahan staged WO-BR-99 + WO13). Menunggu instruksi.

## 7. Pelajaran (retain)

- **SPI provider & strategy terpisah:** engine bergantung pada `MatchStrategy`; strategy bergantung pada provider (injected); provider bergantung pada repository (injected). Perakitan hanya boleh terjadi di composition root.
- **Paritas Dummy≡Prisma penting untuk smoke:** dummy kini meniru semantik SQLite (`contains` case-insensitive ASCII via `toLowerCase`) agar ekspektasi test identik lintas stack.
- **Pindah cross-project harus cek tsconfig:** menambahkan konsumen `src/services` dari `src/main` memicu TS6307; fix minimal = tambah include, bukan pindahkan file.
- **Negative test harus divalidasi terhadap kedua dataset** (Dummy & Prisma) — `pramoedya` bukan negatif untuk dataset Dummy.
- **Bundle size adalah alat deteksi regresi**: WO-6 (factory tanpa konsumen) dan WO-7 (test-only) tidak mengubah ukuran bundle — verifikasi bahwa memang tidak ada konsumen baru sebelum WO-8.

## 8. Kesimpulan

**READY.** Seluruh 8 WO tuntas: Strategy SPI (WO-1), operasi repository eksplisit (WO-2), provider opsional (WO-3), 8 strategy class (WO-4), engine swap (WO-5), composition root produksi (WO-6), smoke 19/19 (WO-7), dan regression tanpa perubahan perilaku tak direncanakan (WO-8). Lint + build hijau, bundle identik baseline, fresh-DB deploy PASS. Compatibility layer dipertahankan sesuai instruksi PO; penghapusan dijadwalkan keluar Sprint 8.
