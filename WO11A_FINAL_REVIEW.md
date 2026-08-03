# WO11A — FINAL REVIEW (AY-1b Follow-up: UI Rewiring)

- **WO:** WO-11A AY-1b FOLLOW-UP — REVISION IMPLEMENTATION (menutup gap T1 dari WO-12)
- **Reviewer gate:** Architecture Gate
- **Status:** **APPROVED — siap release.**

## Kriteria Penerimaan (dari WO-11A)
| Kriteria | Hasil |
|----------|-------|
| Preload mengekspos `academicYears.activate()` + `deactivate()` | PASS — `academic-year.preload.ts` |
| env.d.ts mengetik `activate`/`deactivate` → `Promise<AcademicYearDTO>` | PASS |
| UI menyediakan aksi jelas Buka Tahun / Tutup Tahun | PASS — kolom aksi di `AcademicYearListPage` (confirm + alert + refresh) |
| Checkbox toggle aktif di form edit dihapus / disabled | PASS — `AcademicYearForm` (info disabled + hint; payload tanpa `isActive`) |
| `wo4_ay1a_smoke` PASS (kontrak baru) | PASS — 23/23 |
| `wo5_ay2_smoke` PASS (kontrak baru) | PASS — 19/19 |
| `wo11_ay1b_smoke` PASS (regresi backend) | PASS — 40/40 |
| Regression suite lain PASS (wo6/wo7/wo8/wo9) | PASS — 10/16/16/26 |
| lint PASS | PASS |
| build PASS | PASS (renderer 987.29 kB) |
| Repository / Service / IPC / DTO / Schema / Migration TIDAK diubah | PASS |
| ONE final commit + push | DONE |

## Arsitektur
- **Tidak ada perubahan kontrak backend** — preload memanggil channel `academic-years:activate`/`:deactivate` yang sudah ada (WO-11); service guard (exactly-one-active, sole-active-reject, K3 update-reject) tetap otoritas bisnis.
- **UI dua-lapis:** form edit tidak lagi menawarkan status (mencegah jalur `update(isActive)` yang ditolak service), sedangkan daftar punya aksi eksplisit Buka/Tutup dengan konfirmasi — alur RFC §7 (create → clone → Buka Tahun) kini bisa dijalankan dari aplikasi.
- Label aksi + pesan konfirmasi berada di `labels.ts` (pola konsisten).

## Kesesuaian RFC / WBS
- RFC §2.4: `isActive` hanya berubah lewat Buka/Tutup — kini **ditegakkan di seluruh lapisan** (Service K3 + UI tanpa toggle).
- RFC §7 prasyarat promosi "tepat satu aktif" — dapat dioperasikan user dari UI.
- WBS AY-1b: gap T1 (WO-12) tertutup tanpa mengubah Service/IPC/Repository.

## Risiko Sisa
- T2 (WO-12): wo4/wo5 smoke telah diselaraskan — **tertutup**.
- T3 (WO-12, INFO): delete guard kelas masih memakai `Member.classId` legacy — cutover ke `enrollment.count` adalah WO E-2 (Milestone B), di luar scope.
- Operasi "Tutup Tahun" untuk satu-satunya tahun aktif tetap ditolak service (K2) — UI menampilkan error `alert(err.message)`; ini perilaku yang diminta PO, bukan cacat.

## Verdict
**APPROVED — release.**
