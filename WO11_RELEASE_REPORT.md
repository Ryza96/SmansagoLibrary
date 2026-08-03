# WO11 — RELEASE REPORT (AY-1b Open/Close Academic Year)

- **Release:** WO-11 AY-1b — Operasi eksplisit Buka/Tutup Tahun Ajaran
- **Status:** **READY FOR RELEASE — menunggu review PO.** Satu commit final + push.

## Fitur yang Dirilis
- **Buka Tahun Ajaran** (`academic-years:activate`) — mengaktifkan tahun target dan **otomatis menonaktifkan tahun lama** (Exclusive Active Guard AY-1a) dalam satu transaksi. Idempoten.
- **Tutup Tahun Ajaran** (`academic-years:deactivate`) — menonaktifkan tahun target; **menutup satu-satunya tahun aktif DITOLAK** (AppError 400) sehingga sistem selalu memiliki tepat satu tahun aktif (K2).
- **Perpindahan tahun resmi:** Activate Tahun Baru → tahun lama otomatis nonaktif. Tidak ada kondisi 0 atau >1 tahun aktif.
- **Update tidak lagi mengubah status aktif** (K3) — perubahan `isActive` lewat `update()` ditolak dengan pesan jelas; status hanya berubah lewat `activate()`/`deactivate()`.

## File yang Terkena
```
M src/main/services/academic-year.service.ts
M electron/ipc/academic-year.ipc.ts
A wo11_ay1b_smoke/smoke.ts
A WO11_DISCOVERY_REPORT.md
A WORK_ORDER_11_IMPLEMENTATION_REPORT.md
A WO11_FINAL_REVIEW.md
A WO11_RELEASE_REPORT.md
```
Juga masuk commit (dokumentasi milestone sebelumnya yang belum ter-commit): `MILESTONE_A_FINAL_REVIEW.md`, `MILESTONE_A_PRODUCTION_READINESS_REPORT.md`.

## Validation Gate (final)
- `npm run lint` — PASS
- `npm run build` — PASS (main 1,780.16 kB · preload 7.84 kB · renderer 985.76 kB)
- Smoke fresh DB — **40/40 PASS** (activate/deactivate/exactly-one/update-reject/no-op/404/duplikat/regresi/defensif multi-aktif)
- Grep bundle main: `academic-years:activate` & `academic-years:deactivate` ter-render.

## Artifact
Build `out/` sudah mengandung fitur. Repackage electron-builder + verifikasi `app.asar` mengikuti pola WO-2 bila PO install dari `dist/` — di luar scope WO-11 (dilakukan saat Release Milestone A, WBS WO-12 PR-A).

## Catatan Rilis
- WO ini tidak menyentuh Schema/Migration/Repository/Preload/env.d.ts/UI — tidak ada migration baru, tidak perlu deploy ulang DB.
- Konsekuensi K3: UI AY-2 yang mengubah `isActive` lewat form kini ditolak service — UI rewiring ke `activate`/`deactivate` adalah WO terpisah.
- Commit final mencakup seluruh working tree agar repositori bersih. Setelah commit + push, BERHENTI menunggu review PO (tidak lanjut WO berikutnya).
