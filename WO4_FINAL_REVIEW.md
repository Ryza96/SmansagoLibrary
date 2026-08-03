# WO4_FINAL_REVIEW

**WO-4 — AY-1a: AcademicYear exclusive-active guard**
**Status: DONE — menunggu review Product Owner**

---

## Checklist Implementasi

| Kriteria | Status | Bukti |
|----------|--------|-------|
| Scope sesuai Discovery (guard service + repo transaksional + smoke + docs) | PASS | 2 file source + 1 smoke + 3 laporan + AGENTS.md |
| Guard decision di `AcademicYearService` (WBS scope) | PASS | `create`/`update` → `isActive===true` → metode exclusive-active |
| Eksekusi dalam transaksi (deaktivasi + create/update atomik) | PASS | `createExclusiveActive`/`updateExclusiveActive` via `$transaction` |
| Aktivasi B menonaktifkan A (create & update path) | PASS | smoke STEP 2 & 4 |
| Dua `isActive=true` mustahil | PASS | count aktif === 1 di tiap langkah smoke |
| `findActive()` ≤ 1 record | PASS | guard menjamin; di-assert smoke |
| Path non-aktif tidak berubah | PASS | create/update tanpa aktivasi memakai repo `create`/`update` biasa |
| Tidak mengubah schema / migration / IPC / Preload / UI / DTO | PASS | grep: hanya 2 file source berubah |
| Tidak menyentuh WO berikutnya (AY-1b/AY-2) | PASS | tidak ada operasi Buka/Tutup, tidak ada UI |
| Tidak membuat Source of Truth baru | PASS | RFC/WBS tidak dimodifikasi |

## Checklist Validasi Teknis

| # | Check | Hasil |
|---|-------|-------|
| 1 | Fresh DB (deploy 4 migrations + smoke 21/21) | PASS |
| 2 | Dua aktif mustahil (count===1 setiap langkah) | PASS |
| 3 | Aktivasi B nonaktifkan A (create & update) | PASS |
| 4 | Regresi create/update (nama duplikat, id tak ada) | PASS |
| 5 | `npm run lint` | PASS |
| 6 | `npm run build` | PASS |

## Risiko & Catatan

1. **Race dua aktivasi simultan** — SQLite + `$transaction` men-serialize tulis; deaktivasi & aktivasi atomik → dua aktif mustahil.
2. **Rollback** — bila create/update target gagal, deaktivasi ikut rollback (tahun lama tetap aktif); tidak ada window "nol aktif".
3. **Guard hanya mengikat jalur service** — caller repo langsung (`repository.create({isActive:true})`) masih bisa membuat 2 aktif; ini di luar scope WBS (guard = service) dan konsisten dengan keputusan RFC bahwa guard hidup di service. AY-1b akan mengekspos operasi Buka/Tutup resmi.

## Rekomendasi

- **LULUS** untuk WO-4 AY-1a.
- Lanjut ke WO berikutnya (AY-1b — Operasi Buka/Tutup Tahun) setelah review PO.
