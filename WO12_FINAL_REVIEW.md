# WO12 — FINAL REVIEW (T-A Testing & UAT Milestone A)

- **WO:** WO-12 T-A — Testing & UAT Milestone A
- **Reviewer gate:** Architecture Gate
- **Status:** **REVISION REQUIRED**

## Kriteria (dari Work Order + WBS T-A)
| Kriteria | Hasil |
|---|---|
| Academic Year CRUD | PASS |
| Academic Year Activate / Deactivate / Exclusive Active / Exactly-One | PASS (backend) — **gap UI (T1)** |
| Academic Year Duplicate / Delete Guard | PASS |
| Curriculum CRUD / Duplicate / Delete Guard | PASS |
| Class CRUD / Duplicate / Immutable / Delete Guard | PASS |
| Class Clone / Duplicate Skip / Idempotent / Source ≠ Target | PASS |
| lint PASS | PASS |
| build PASS | PASS (main 1,780.16 · preload 7.84 · renderer 985.76 kB) |
| Smoke PASS | **8/10 suite hijau (217 PASS); wo4 & wo5 stale (T2)** |
| Regression (menu lama, routing, sidebar, navigation, labels, IPC, preload, service, repository) | PASS |
| Milestone A E2E reachable dari aplikasi | **GAGAL pada langkah "Buka Tahun" (T1)** |

## Temuan Kunci
- **T1 (HIGH):** `academic-years:activate`/`:deactivate` tidak diekspos di preload/env.d.ts dan tidak ada affordance UI. Jalur lama (checkbox toggle saat edit form AY) ditolak service sejak K3 (WO-11). → Operator **tidak dapat membuka tahun ajaran nonaktif dari aplikasi**; alur RFC §7 (buat tahun nonaktif → clone → buka) terputus; kondisi "semua tahun nonaktif" tidak dapat dipulihkan via UI dan akan membuat member import memetakan seluruh baris ke `classNotFound`.
- **T2 (LOW–MEDIUM):** `wo4_ay1a_smoke` & `wo5_ay2_smoke` stale — menguji kontrak pre-K3 (`update(isActive)`), 2/10 suite gagal. Test debt, bukan cacat produk (kontrak baru terbukti wo11 40/40).
- **T3 (INFO):** Delete-guard Class masih `Member.classId` (cutover ke enrollment = WO E-2, di luar Milestone A).

## Alasan Teknis REVISION REQUIRED
1. **Feature tidak user-reachable end-to-end.** WO-11 (AY-1b) selesai di Service+IPC tetapi tidak dihubungkan ke preload/env.d.ts/UI (K4). Dampak gabungan dengan K3 = UI AY-2 yang lama justru menjadi dead-end (error 400), dan tidak ada jalur pengganti. Untuk T-A, ini adalah gap fungsional Milestone A, bukan sekadar polish.
2. **Smoke coverage tidak sepenuhnya hijau** (wo4/wo5 stale) — basis verifikasi perlu diselaraskan ke kontrak K3.

Keduanya **tidak menyentuh arsitektur/service/repo/schema** dan dapat ditutup oleh satu WO follow-up kecil:
- expose `academicYears.activate`/`.deactivate` di `academic-year.preload.ts` + `env.d.ts` (+ optional 2 route/aksi di UI list/form AY);
- perbarui/arsip wo4 & wo5 smoke ke kontrak K3;
- rerun lint+build+smoke.

## Verdict
**REVISION REQUIRED**

- **Apa yang sudah benar (tidak perlu diulang):** seluruh backend Milestone A — guard exclusive-active, invariant tepat-satu-aktif (K2), tolak `update(isActive)` (K3), guard duplikat/immutable/delete, clone idempoten; wiring service/repo/IPC; frontend master CRUD + clone; lint/build hijau.
- **Yang wajib direvisi sebelum PO review Milestone A:** menghubungkan Buka/Tutup Tahun ke UI/preload/env.d.ts (T1) + menyelaraskan smoke stale (T2).
- **Tidak ada blocker arsitektural.** Mode READ ONLY dipatuhi (0 perubahan source, 0 commit). Menunggu keputusan Product Owner.
