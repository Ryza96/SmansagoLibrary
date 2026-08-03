# WO11 — FINAL REVIEW (AY-1b Open/Close Academic Year)

- **WO:** WO-11 AY-1b — Operasi eksplisit Buka/Tutup Tahun Ajaran
- **Reviewer gate:** Architecture Gate
- **Status:** **APPROVED — siap release.**

## Kriteria Penerimaan (dari Work Order)
| Kriteria | Hasil |
|----------|-------|
| K1: DUA channel IPC (`academic-years:activate` + `academic-years:deactivate`) | PASS — 2 handler di `academic-year.ipc.ts` |
| K2: Activate PASS (Buka Tahun → tahun lama otomatis nonaktif) | PASS (smoke STEP 3, 5) |
| K2: Deactivate PASS (menutup satu-satunya tahun aktif DITOLAK) | PASS (smoke STEP 4, 7) |
| K2: Exactly One Active PASS (selalu tepat 1 aktif, tidak pernah 0 / >1) | PASS (smoke STEP 1-17, count==1 di tiap langkah) |
| K3: Update(isActive) Rejected PASS | PASS (smoke STEP 8 — perubahan isActive ditolak 400) |
| K4: Preload / env.d.ts / UI TIDAK diubah | PASS |
| Regression CRUD PASS (create/update/delete + duplikat + 404) | PASS (smoke STEP 9-13, 16) |
| Repository / Schema / Migration / Curriculum / Class / Clone / Enrollment / Promotion TIDAK diubah | PASS |
| lint PASS | PASS |
| build PASS | PASS (main 1,780.16 kB · preload 7.84 kB · renderer 985.76 kB) |
| Smoke PASS | PASS 40/40 (fresh DB, 4 migrations) |

## Arsitektur
- Business rule di Service layer — konsisten pola WO-4 (guard AY-1a) & lesson AGENTS.
- `activate` memakai repository `updateExclusiveActive` (transaksi exclusive-active) — TIDAK menambah method repository (scope: Repository N/A).
- `deactivate` memakai `findActive()` untuk memverifikasi target = satu-satunya tahun aktif sebelum menonaktifkan — mencegah kondisi 0 aktif (K2).
- `update` K3 guard di Service sebelum menyentuh repository — pola sama dengan CL-1 (WO-7) guard immutability.
- DTO/IPC shape tidak berubah; kedua channel hanya menerima `id`.

## Kesesuaian RFC / WBS
- RFC §2.4: `isActive` kini hanya berubah lewat Buka/Tutup — **terpenuhi** (jalur `update` ditutup, K3).
- RFC §7 prasyarat promosi "tepat satu `isActive`" — dijamin guard exclusive + tolak deactivate sole active.
- WBS AY-1b Flow (Service → IPC → Testing; Repo/Preload/UI = N/A) — dipatuhi.

## Risiko Sisa
- UI AY-2 (form toggle aktif) akan menampilkan error service bila mencoba mengubah status — **bukan bug**: UI rewiring ke `activate`/`deactivate` adalah WO terpisah (di luar scope AY-1b, K4).
- Operasi `deactivate` di kondisi normal (tepat 1 aktif) selalu ditolak — ini perilaku yang diminta PO (K2), bukan cacat. Jalur deactivate sukses hanya untuk kondisi defensif multi-aktif.

## Verdict
**APPROVED — release.**
