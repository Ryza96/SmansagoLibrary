# R-4 RELEASE REPORT — Laporan Keterlambatan

## Status: RELEASED (2026-08-05) — FINAL PACKAGE VERIFIED

## Deliverable
| Item | Path |
|------|------|
| Halaman Laporan Keterlambatan | `src/pages/report/OverdueReportPage.tsx` |
| Landing modul Laporan | `src/pages/ReportsPage.tsx` (+ kartu) |
| Route + nav + labels | `src/routes/index.tsx`, `src/utils/navigation.ts`, `src/utils/labels.ts` |
| Backend (aditif) | `src/shared/dto/report.ts`, `src/main/repositories/report.repository.ts`, `src/main/services/report.service.ts` |
| Smoke | `report_r4_smoke/smoke.ts` (40/40) |

## Fitur (UI)
- Filter **Periode** (Dari/Sampai tanggal) + **Pencarian** (nomor transaksi, nomor/nama anggota, judul buku) — server-side.
- 3 kartu statistik dari `summary` DTO: **Total Terlambat · Belum Dikembalikan · Sudah Dikembalikan Terlambat**.
- Tabel 8 kolom: Tanggal Pinjam · Nomor Transaksi · Nama Anggota (nomor · nama) · Kelas (enrollment snapshot) · Judul Buku · Jatuh Tempo · **Hari Terlambat (N hari)** · **Status (badge Masih Terlambat / Sudah Dikembalikan Terlambat)**.
- Pagination server-side (20/halaman), loading & empty state.
- **1 baris = 1 buku** (kategori MASIH TERLAMBAT juga per-buku, konsisten R-2/R-3).

## Akses
`Laporan` (sidebar) → kartu **Laporan Keterlambatan** → `/reports/overdues`.

## Regression
- `report_r4_smoke` **40/40** · `report_r1_smoke` **46/46** · `report_r1_service_smoke` **52/52** · `it1_borrow_return` **34/34** · `it_borrow_eligibility` **7/7** · `wo14_e2` **36/36** (fresh DB temp) — **215 PASS, 0 FAIL**.
- lint PASS · build PASS (main 1,868.46 · preload 9.95 · renderer 1,104.99 kB) · `prisma migrate diff` "empty migration" (schema & migration TIDAK disentuh).

## Release Finalization (2026-08-05)
- **Defensive hardening (PO-approved, dipertahankan):** `buildActiveOverdueWhere` trim-normalized identik dengan `buildReturnedLateSearchSql` (`search?.trim()`) — Invariant A (search ACTIVE == RETURNED) ditutup; `getOverdueReport` clamp `slice(0, limit)` — Invariant B (`rows.length <= limit`) tiga lapis (slice math → SQL LIMIT → clamp). Ditambah laporan audit `IMPLEMENTATION_AUDIT_R4.md` + `BUILD_ARTIFACT_AUDIT.md`.
- **Komit hardening:** `d42610c` — `fix(report): R-4 defensive hardening ...` (di-push).
- **Package rebuild:** `npm run package:win` EXIT 0 (05/08 11:25). `electron-builder.yml` + `win.signAndEditExecutable: false` — mesin tanpa Developer Mode/admin gagal mengekstrak symlink macOS (`libcrypto.dylib`/`libssl.dylib`) pada artefak `winCodeSign-2.6.0` saat `signApp`; signing memang dilewati (tanpa sertifikat), rcedit-metadata tidak dipakai (ikon default) — dampak kosmetik, didokumentasikan.
- **Verifikasi app.asar (dist/win-unpacked/resources/app.asar, 52,668,776 B):** bundle renderer `index-z9hEr1Se.js` **byte-identik** `out/` (SHA-256 `D7A55F6C…`); main `index.js` identik; channel `reports:borrowings/returns/overdues/members/collections` (5/5) + preload `reports:` invoke ter-render; marker UI `Laporan Keterlambatan`/`Masih Terlambat`/`Hari Terlambat`/`reports/overdues` = ada. Bundle lama `index-BYfUl8e8.js` tidak ada lagi di asar.
- **Komit release doc:** final commit laporan + `electron-builder.yml` + AGENTS.md (hash di bawah).

## Komit
- `7a2a4ab` — R-4 fitur (source + smoke + 3 laporan).
- `d42610c` — defensive hardening + audit docs.
- `ea16758` — release doc + `electron-builder.yml` (signAndEditExecutable) + AGENTS.md.
- File untracked milik WO lain TIDAK diikutkan.
